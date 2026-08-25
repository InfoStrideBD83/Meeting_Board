import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './Avatar.jsx';
import styles from './MessagingWidget.module.css';

const POLL_LIST_MS = 15000;
const POLL_THREAD_MS = 4000;

const ico = {
  message: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
  ),
  back: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  ),
  group: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
};

function timeAgo(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A floating messaging widget mounted once at the app root (see App.jsx),
 *  so it's available on every authenticated page. DMs and group chats,
 *  backed by server/src/routes/conversations.js. "Notification" here is
 *  an in-app unread badge kept fresh by polling — this app has no
 *  WebSocket/push infrastructure, so it only updates while a tab is open,
 *  the same way the header's NotificationBell already works. */
export function MessagingWidget() {
  const { isAuthenticated, member } = useAuth();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'chat' | 'new'
  const [conversations, setConversations] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const threadEndRef = useRef(null);

  const refreshList = useCallback(() => {
    apiFetch('/conversations').then(setConversations).catch(() => { /* transient — next poll retries */ });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    refreshList();
    const id = setInterval(refreshList, POLL_LIST_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refreshList]);

  useEffect(() => {
    if (open && isAuthenticated && members.length === 0) {
      apiFetch('/members').then(setMembers).catch(() => {});
    }
  }, [open, isAuthenticated, members.length]);

  const refreshThread = useCallback(() => {
    if (!activeId) return;
    apiFetch(`/conversations/${encodeURIComponent(activeId)}/messages`)
      .then(setMessages)
      .catch(() => { /* transient — next poll retries */ });
  }, [activeId]);

  useEffect(() => {
    if (!activeId || view !== 'chat') return undefined;
    refreshThread();
    const id = setInterval(refreshThread, POLL_THREAD_MS);
    return () => clearInterval(id);
  }, [activeId, view, refreshThread]);

  useEffect(() => {
    if (view !== 'chat' || !activeId) return;
    apiFetch(`/conversations/${encodeURIComponent(activeId)}/read`, { method: 'POST' }).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function openConversation(id) {
    setActiveId(id);
    setMessages([]);
    setView('chat');
  }

  function backToList() {
    setView('list');
    setActiveId(null);
    refreshList();
  }

  function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    apiFetch(`/conversations/${encodeURIComponent(activeId)}/messages`, { method: 'POST', body: { body } })
      .then((msg) => {
        setMessages((prev) => prev.concat([msg]));
        setDraft('');
        refreshList();
      })
      .catch((err) => alert(err.message || 'Could not send this message.'))
      .finally(() => setSending(false));
  }

  function startNewGroup() {
    setView('new');
    setGroupName('');
    setSelectedIds(new Set());
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function startDM(memberId) {
    setCreating(true);
    apiFetch('/conversations', { method: 'POST', body: { member_id: memberId } })
      .then((convo) => { refreshList(); openConversation(convo.id); })
      .catch((err) => alert(err.message || 'Could not start this conversation.'))
      .finally(() => setCreating(false));
  }

  function createGroup(e) {
    e.preventDefault();
    if (selectedIds.size === 0) { alert('Pick at least one team member.'); return; }
    setCreating(true);
    apiFetch('/conversations', {
      method: 'POST',
      body: { name: groupName.trim(), member_ids: Array.from(selectedIds) },
    })
      .then((convo) => { refreshList(); openConversation(convo.id); })
      .catch((err) => alert(err.message || 'Could not create this group.'))
      .finally(() => setCreating(false));
  }

  if (!isAuthenticated) return null;

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const active = conversations.find((c) => c.id === activeId);
  const pickable = members.filter((m) => m.id !== (member && member.id));

  const groups = conversations.filter((c) => c.is_group);
  const dmByMemberId = {};
  conversations.forEach((c) => { if (!c.is_group && c.other_member) dmByMemberId[c.other_member.id] = c; });
  const teamRows = pickable
    .map((m) => ({ member: m, convo: dmByMemberId[m.id] || null }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close messages' : 'Open messages'}
        title="Messages"
      >
        {ico.message}
        {unreadTotal > 0 && <span className={styles.launcherBadge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Messages">
          <div className={styles.panelHead}>
            {view === 'chat' ? (
              <>
                <button type="button" className={styles.iconBtn} onClick={backToList} aria-label="Back to conversations">{ico.back}</button>
                <div className={styles.panelTitle}>
                  {active ? active.name : 'Conversation'}
                  {active && active.is_group && <span className={styles.groupTag}>Group</span>}
                </div>
              </>
            ) : view === 'new' ? (
              <>
                <button type="button" className={styles.iconBtn} onClick={() => setView('list')} aria-label="Back to conversations">{ico.back}</button>
                <div className={styles.panelTitle}>Create group</div>
              </>
            ) : (
              <div className={styles.panelTitle}>Messages</div>
            )}
            <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close messages">{ico.close}</button>
          </div>

          {view === 'list' && (
            <>
              <div className={styles.listToolbar}>
                <button type="button" className="btn btn-primary" onClick={startNewGroup}>
                  {ico.group}<span className="btn-label-sm">Create Group</span>
                </button>
              </div>
              <div className={styles.list}>
                {groups.length > 0 && (
                  <>
                    <div className={styles.sectionLabel}>Groups</div>
                    {groups.map((c) => (
                      <button type="button" key={c.id} className={styles.convoItem} onClick={() => openConversation(c.id)}>
                        <span className={styles.groupIcon}>{ico.group}</span>
                        <span className={styles.convoBody}>
                          <span className={styles.convoName}>{c.name}</span>
                          <span className={styles.convoPreview}>
                            {c.last_message ? c.last_message.body : 'No messages yet'}
                          </span>
                        </span>
                        <span className={styles.convoMeta}>
                          {c.last_message && <span className={styles.convoTime}>{timeAgo(c.last_message.created_at)}</span>}
                          {c.unread_count > 0 && <span className={styles.unreadDot}>{c.unread_count}</span>}
                        </span>
                      </button>
                    ))}
                  </>
                )}

                <div className={styles.sectionLabel}>Team</div>
                {teamRows.length === 0 ? (
                  <div className={styles.empty}><p>No other team members yet.</p></div>
                ) : (
                  teamRows.map(({ member: m, convo }) => (
                    <button
                      type="button"
                      key={m.id}
                      className={styles.convoItem}
                      disabled={creating}
                      onClick={() => (convo ? openConversation(convo.id) : startDM(m.id))}
                    >
                      <Avatar name={m.name} color={m.color} size={38} />
                      <span className={styles.convoBody}>
                        <span className={styles.convoName}>{m.name}</span>
                        <span className={styles.convoPreview}>
                          {convo && convo.last_message ? convo.last_message.body : 'Tap to start a conversation'}
                        </span>
                      </span>
                      <span className={styles.convoMeta}>
                        {convo && convo.last_message && <span className={styles.convoTime}>{timeAgo(convo.last_message.created_at)}</span>}
                        {convo && convo.unread_count > 0 && <span className={styles.unreadDot}>{convo.unread_count}</span>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {view === 'new' && (
            <form className={styles.groupForm} onSubmit={createGroup}>
              <input
                className={styles.groupNameInput}
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <div className={styles.memberPicker}>
                {pickable.length === 0 ? (
                  <div className={styles.empty}><p>No other team members yet.</p></div>
                ) : pickable.map((m) => (
                  <label key={m.id} className={styles.memberRowCheck}>
                    <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelected(m.id)} />
                    <Avatar name={m.name} color={m.color} size={32} />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating || pickable.length === 0} style={{ width: '100%' }}>
                {creating ? 'Creating…' : 'Create group'}
              </button>
            </form>
          )}

          {view === 'chat' && (
            <>
              <div className={styles.thread}>
                {messages.map((m) => {
                  const mine = m.sender_id === (member && member.id);
                  const senderName = !mine && active && active.is_group
                    ? ((active.members || []).find((x) => x.id === m.sender_id) || {}).name
                    : null;
                  return (
                    <div key={m.id} className={`${styles.bubbleRow} ${mine ? styles.mine : ''}`}>
                      {senderName && <span className={styles.bubbleSender}>{senderName}</span>}
                      <div className={styles.bubble}>{m.body}</div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
              <form className={styles.composer} onSubmit={sendMessage}>
                <input
                  className={styles.composerInput}
                  type="text"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" className={styles.sendBtn} disabled={sending || !draft.trim()} aria-label="Send message">
                  {ico.send}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
