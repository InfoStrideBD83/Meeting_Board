import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { supabaseRealtime } from '../api/supabaseRealtime.js';
import { useAuth } from './AuthContext.jsx';

const CallContext = createContext(null);

// Public STUN only — there's no TURN server in this app's infra, so a call
// between two members both behind strict/symmetric NATs (common on mobile
// data, rare on a shared office network) may fail to connect. Good enough
// for an internal tool; a real TURN server would be the next step if that
// turns out to matter in practice.
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const RING_TIMEOUT_MS = 45000;

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

/** A synthesized two-tone ring (no audio asset needed) — pulses the gain
 *  node on/off rather than starting/stopping the oscillator, since
 *  repeatedly stopping and recreating an oscillator node is the noisier
 *  (and more error-prone) way to get the same effect. Browsers may start a
 *  freshly created AudioContext 'suspended' until the tab has had some user
 *  gesture; by the time anyone's using this app at all (signing in, opening
 *  a page) that's already satisfied, so in practice this plays immediately. */
function startRingtone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 480;
    osc.connect(gain);
    osc.start();
    ctx.resume().catch(() => {});
    let on = false;
    const interval = setInterval(() => {
      on = !on;
      gain.gain.setTargetAtTime(on ? 0.05 : 0.0001, ctx.currentTime, 0.01);
    }, 550);
    return { ctx, osc, interval };
  } catch { return null; }
}
function stopRingtone(handle) {
  if (!handle) return;
  clearInterval(handle.interval);
  try { handle.osc.stop(); handle.ctx.close(); } catch { /* ignore */ }
}

/** A system notification for an incoming call, same guard as
 *  MessagingWidget's notifyNewMessages: only when the tab isn't the one
 *  someone's actively looking at (otherwise the in-app ring banner is
 *  already enough), and only if they've granted permission at some earlier
 *  point — there's no gesture here to request it fresh. */
function notifyIncomingCall(payload) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!(document.hidden || !document.hasFocus())) return;
  try {
    const notif = new Notification(`Incoming call — ${payload.fromName}`, {
      body: payload.isGroup ? `Voice call · ${payload.conversationName}` : 'Voice call',
      icon: '/apple-touch-icon.png',
      tag: `call-${payload.callId}`,
    });
    notif.onclick = () => { window.focus(); notif.close(); };
  } catch { /* some embedded browsers throw on `new Notification(...)` despite reporting support */ }
}

/** App-wide voice calling over Supabase Realtime (the same ephemeral
 *  broadcast/presence mechanism RaceLobby.jsx uses for live car positions —
 *  no database table, nothing persisted beyond a single "call started"
 *  chat message). Two layers:
 *
 *  1. A personal "inbox" channel per member (`member-inbox-{id}`), always
 *     subscribed while signed in, used only to deliver a ring (and its
 *     cancellation) — this is how a call reaches someone before they've
 *     joined anything call-specific.
 *  2. A per-call channel (`call-{callId}`) that everyone who starts or
 *     accepts the call joins, using Realtime Presence as the roster and
 *     Broadcast as the WebRTC signaling transport (offer/answer/ICE). Audio
 *     is a full mesh — each participant opens a direct RTCPeerConnection to
 *     every other participant — which is simple and needs no media server,
 *     but doesn't scale past a handful of people; fine for this app's group
 *     sizes.
 *
 *  Only one call (incoming or active) is tracked at a time; a ring that
 *  arrives while busy is silently dropped rather than surfaced. */
export function CallProvider({ children }) {
  const { member } = useAuth();
  const memberRef = useRef(member);
  memberRef.current = member;

  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [declineNotice, setDeclineNotice] = useState(null);

  const activeCallRef = useRef(null);
  activeCallRef.current = activeCall;
  const incomingCallRef = useRef(null);
  incomingCallRef.current = incomingCall;
  const ringtoneRef = useRef(null);

  // Ties the ringtone to incomingCall itself rather than to each dismissal
  // path separately (accept / decline / cancel / timeout) — whichever one
  // fires, incomingCall ends up null and this stops it exactly once.
  useEffect(() => {
    if (incomingCall) {
      ringtoneRef.current = startRingtone();
    } else if (ringtoneRef.current) {
      stopRingtone(ringtoneRef.current);
      ringtoneRef.current = null;
    }
  }, [incomingCall]);

  const inboxChannelRef = useRef(null);
  const callChannelRef = useRef(null);
  const peersRef = useRef(new Map()); // memberId -> { pc, audioEl, pending }
  const localStreamRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const ringTargetsRef = useRef([]); // who's still being rung for the call I started, if anyone

  function cancelRing(callId, targets) {
    if (!supabaseRealtime) return;
    targets.forEach((id) => {
      const inbox = supabaseRealtime.channel(`member-inbox-${id}`, { config: { broadcast: { self: false } } });
      inbox.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          inbox.send({ type: 'broadcast', event: 'cancel', payload: { callId } });
          setTimeout(() => supabaseRealtime.removeChannel(inbox), 1500);
        }
      });
    });
  }

  function sendSignal(channel, to, kind, data) {
    channel.send({ type: 'broadcast', event: 'rtc', payload: { to, from: memberRef.current.id, kind, data } });
  }

  function ensurePeer(channel, remoteId) {
    const existing = peersRef.current.get(remoteId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE_CONFIG);
    const entry = { pc, audioEl: null, pending: [] };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal(channel, remoteId, 'ice', e.candidate); };
    pc.ontrack = (e) => {
      if (!entry.audioEl) { entry.audioEl = new Audio(); entry.audioEl.autoplay = true; }
      entry.audioEl.srcObject = e.streams[0];
      entry.audioEl.play().catch(() => { /* needs a user gesture on some browsers — the call itself started from one */ });
    };
    peersRef.current.set(remoteId, entry);
    return entry;
  }

  async function flushPending(entry) {
    const queued = entry.pending;
    entry.pending = [];
    for (const c of queued) await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }

  function teardownPeer(id) {
    const entry = peersRef.current.get(id);
    if (!entry) return;
    entry.pc.close();
    if (entry.audioEl) { entry.audioEl.pause(); entry.audioEl.srcObject = null; }
    peersRef.current.delete(id);
  }

  async function connectTo(channel, remoteId) {
    const entry = ensurePeer(channel, remoteId);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    sendSignal(channel, remoteId, 'offer', offer);
  }

  async function handleSignal(channel, payload) {
    if (String(payload.to) !== String(memberRef.current.id)) return;
    const remoteId = payload.from;
    if (payload.kind === 'offer') {
      const entry = ensurePeer(channel, remoteId);
      await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.data));
      await flushPending(entry);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      sendSignal(channel, remoteId, 'answer', answer);
    } else if (payload.kind === 'answer') {
      const entry = peersRef.current.get(remoteId);
      if (entry) { await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.data)); await flushPending(entry); }
    } else if (payload.kind === 'ice') {
      const entry = ensurePeer(channel, remoteId);
      if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(new RTCIceCandidate(payload.data)).catch(() => {});
      else entry.pending.push(payload.data);
    }
  }

  function updateParticipantsState(presenceState) {
    const myId = String(memberRef.current.id);
    const list = [];
    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key];
      if (!presences || !presences.length) continue;
      const p = presences[0];
      list.push({ memberId: key, name: p.name, color: p.color, muted: Boolean(p.muted), isSelf: key === myId });
    }
    setActiveCall((prev) => (prev ? { ...prev, participants: list } : prev));
  }

  function reconcilePeers(channel) {
    const state = channel.presenceState();
    const myId = String(memberRef.current.id);
    const presentIds = Object.keys(state).filter((id) => id !== myId);

    if (presentIds.length && ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    // Once anyone's actually joined, the call is live — stop treating a
    // later leaveCall() as "nobody answered" for whoever's still unjoined.
    if (presentIds.length) ringTargetsRef.current = [];

    for (const id of Array.from(peersRef.current.keys())) {
      if (!presentIds.includes(id)) teardownPeer(id);
    }
    for (const id of presentIds) {
      if (peersRef.current.has(id)) continue;
      // Deterministic tie-break so exactly one side of each pair offers —
      // otherwise both sides create simultaneous offers ("glare").
      if (myId < id) connectTo(channel, id);
      else ensurePeer(channel, id);
    }
    updateParticipantsState(state);
  }

  function joinCallChannel(callId, convo, isInitiator) {
    const channel = supabaseRealtime.channel(`call-${callId}`, {
      config: { broadcast: { self: false }, presence: { key: String(memberRef.current.id) } },
    });
    callChannelRef.current = channel;
    peersRef.current = new Map();

    channel.on('presence', { event: 'sync' }, () => reconcilePeers(channel));
    channel.on('broadcast', { event: 'rtc' }, ({ payload }) => handleSignal(channel, payload));
    channel.on('broadcast', { event: 'decline' }, ({ payload }) => {
      setDeclineNotice(`${payload.name} declined`);
      setTimeout(() => setDeclineNotice(null), 4000);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ memberId: memberRef.current.id, name: memberRef.current.name, color: memberRef.current.color });
      }
    });

    setActiveCall({
      callId,
      conversationId: convo.id,
      conversationName: convo.name,
      isGroup: Boolean(convo.is_group),
      startedAt: Date.now(),
      mutedSelf: false,
      participants: [],
    });
    setIncomingCall(null);

    if (isInitiator) {
      ringTimeoutRef.current = setTimeout(() => {
        if (peersRef.current.size === 0) leaveCall();
      }, RING_TIMEOUT_MS);
    }
  }

  const leaveCall = useCallback(() => {
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    if (ringTargetsRef.current.length && activeCallRef.current) {
      // Nobody answered yet — let their banners disappear right away
      // instead of waiting out the full ring timeout on their end.
      cancelRing(activeCallRef.current.callId, ringTargetsRef.current);
    }
    ringTargetsRef.current = [];
    for (const id of Array.from(peersRef.current.keys())) teardownPeer(id);
    if (callChannelRef.current) { supabaseRealtime.removeChannel(callChannelRef.current); callChannelRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    setActiveCall(null);
  }, []);

  const startCall = useCallback(async (convo) => {
    if (!supabaseRealtime) { alert("Calling isn't set up on this deployment yet."); return; }
    if (activeCallRef.current || incomingCallRef.current) { alert("You're already on a call."); return; }

    const otherIds = convo.is_group
      ? (convo.members || []).filter((m) => m.id !== memberRef.current.id).map((m) => m.id)
      : (convo.other_member ? [convo.other_member.id] : []);
    if (otherIds.length === 0) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access is required to start a call.');
      return;
    }
    localStreamRef.current = stream;

    const callId = uid();
    ringTargetsRef.current = otherIds;
    const ringPayload = {
      callId,
      conversationId: convo.id,
      conversationName: convo.name,
      isGroup: Boolean(convo.is_group),
      fromId: memberRef.current.id,
      fromName: memberRef.current.name,
    };
    otherIds.forEach((id) => {
      const inbox = supabaseRealtime.channel(`member-inbox-${id}`, { config: { broadcast: { self: false } } });
      inbox.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          inbox.send({ type: 'broadcast', event: 'ring', payload: ringPayload });
          setTimeout(() => supabaseRealtime.removeChannel(inbox), 2000);
        }
      });
    });

    apiFetch(`/conversations/${encodeURIComponent(convo.id)}/messages`, {
      method: 'POST',
      body: { body: '📞 Started a voice call' },
    }).catch(() => { /* best-effort chat-history marker, not load-bearing */ });

    // Alongside the Realtime ring above (instant, but only reaches an
    // already-open tab), also push a real notification through the
    // server — this is what reaches someone whose browser is closed or
    // backgrounded, same as a missed-message push.
    apiFetch('/push/ring', {
      method: 'POST',
      body: { conversationId: convo.id, callId, conversationName: convo.name, isGroup: Boolean(convo.is_group) },
    }).catch(() => {});

    joinCallChannel(callId, convo, true);
  }, []);

  const acceptCall = useCallback(async () => {
    const invite = incomingCallRef.current;
    if (!invite) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access is required to join this call.');
      setIncomingCall(null);
      return;
    }
    localStreamRef.current = stream;
    joinCallChannel(invite.callId, { id: invite.conversationId, name: invite.conversationName, is_group: invite.isGroup }, false);
  }, []);

  const declineCall = useCallback(() => {
    const invite = incomingCallRef.current;
    setIncomingCall(null);
    if (!invite || !supabaseRealtime) return;
    const ch = supabaseRealtime.channel(`call-${invite.callId}`, { config: { broadcast: { self: false } } });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'decline', payload: { memberId: memberRef.current.id, name: memberRef.current.name } });
        setTimeout(() => supabaseRealtime.removeChannel(ch), 1500);
      }
    });
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || !activeCallRef.current) return;
    const nowMuted = !activeCallRef.current.mutedSelf;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !nowMuted; });
    if (callChannelRef.current) {
      callChannelRef.current.track({ memberId: memberRef.current.id, name: memberRef.current.name, color: memberRef.current.color, muted: nowMuted });
    }
    setActiveCall((prev) => (prev ? { ...prev, mutedSelf: nowMuted } : prev));
  }, []);

  // Always-on personal inbox — lets a ring reach this member regardless of
  // what they're currently looking at in the app.
  useEffect(() => {
    if (!supabaseRealtime || !member) return undefined;
    const ch = supabaseRealtime.channel(`member-inbox-${member.id}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'ring' }, ({ payload }) => {
      if (activeCallRef.current || incomingCallRef.current) return; // already busy — drop silently
      setIncomingCall(payload);
      notifyIncomingCall(payload);
      // Safety net alongside the explicit 'cancel' broadcast below: if the
      // caller's own tab closes outright (never gets to send 'cancel') or
      // the message is simply missed, this banner would otherwise sit there
      // forever waiting for a reply to a call nobody can still hear.
      setTimeout(() => {
        setIncomingCall((prev) => (prev && prev.callId === payload.callId ? null : prev));
      }, RING_TIMEOUT_MS);
    });
    ch.on('broadcast', { event: 'cancel' }, ({ payload }) => {
      setIncomingCall((prev) => (prev && prev.callId === payload.callId ? null : prev));
    });
    ch.subscribe();
    inboxChannelRef.current = ch;
    return () => { supabaseRealtime.removeChannel(ch); inboxChannelRef.current = null; };
  }, [member && member.id]);

  // Full cleanup if the whole app unmounts mid-call (tab close is caught by
  // the browser tearing the connection down on its own either way).
  useEffect(() => () => {
    if (callChannelRef.current) supabaseRealtime.removeChannel(callChannelRef.current);
    for (const id of Array.from(peersRef.current.keys())) teardownPeer(id);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    callAvailable: Boolean(supabaseRealtime),
    incomingCall,
    activeCall,
    declineNotice,
    startCall,
    acceptCall,
    declineCall,
    leaveCall,
    toggleMute,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider');
  return ctx;
}
