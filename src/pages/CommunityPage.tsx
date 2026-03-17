import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import Navbar from "../components/Navbar";
import { getAuth, getToken } from "../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reaction { heart: number; handshake: number; star: number }
interface Comment { id: string; author: string; text: string; createdAt: string }
interface Post {
  id: string;
  author: string;
  text: string;
  image?: string;
  reactions: Reaction;
  category: string;
  anonymous: boolean;
  comments: Comment[];
  createdAt: string;
  pinned: boolean;
  highlighted: boolean;
  resolved: boolean;
  reviewed: boolean;
}
interface PollOption { id: string; text: string; votes: number; safe: boolean }
interface Poll {
  id: string;
  question: string;
  description: string;
  options: PollOption[];
  totalVotes: number;
  closed: boolean;
}
interface LiveMessage { id: string; author: string; text: string; time: string; isSystem?: boolean }
interface LiveRoom {
  id: string;
  title: string;
  topic: string;
  participants: number;
  moderator: string;
  messages: LiveMessage[];
  isActive: boolean;
  createdAt: string;
}
interface LiveParticipant { id: string; name: string; video: boolean }

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE = "/api/community";
const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const authHeaders = (headers: Record<string, string> = {}) => {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

const apiFetch = (url: string, options: RequestInit = {}) => {
  const headers = authHeaders({ ...(options.headers as Record<string, string> ?? {}) });
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
};

// ─── API layer (wired to community.py blueprint) ──────────────────────────────
const API = {
  // ── Posts ──
  getPosts: (): Promise<Post[]> =>
    apiFetch(`${BASE}/posts`).then(r => r.json()),

  createPost: (data: {
    author: string; text: string; category: string; anonymous: boolean; image?: string;
  }): Promise<Post> =>
    apiFetch(`${BASE}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updatePost: (postId: string, patch: Record<string, unknown>): Promise<Post> =>
    apiFetch(`${BASE}/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(r => r.json()),

  deletePost: (postId: string): Promise<void> =>
    apiFetch(`${BASE}/posts/${postId}`, { method: "DELETE" }).then(() => undefined),

  reactToPost: (postId: string, type: keyof Reaction): Promise<Reaction> =>
    apiFetch(`${BASE}/posts/${postId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    }).then(r => r.json()),

  addComment: (postId: string, text: string, author: string): Promise<Comment> =>
    apiFetch(`${BASE}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author }),
    }).then(r => r.json()),

  removeAllComments: (postId: string): Promise<void> =>
    apiFetch(`${BASE}/posts/${postId}/comments`, { method: "DELETE" }).then(() => undefined),

  aiModeratePost: (postId: string): Promise<{ safe: boolean; flag: string; suggestion: string }> =>
    apiFetch(`${BASE}/posts/${postId}/ai-moderate`, { method: "POST" }).then(r => r.json()),

  // ── Polls ──
  getPolls: (): Promise<Poll[]> =>
    apiFetch(`${BASE}/polls`).then(r => r.json()),

  createPoll: (data: { question: string; description: string; options: string[] }): Promise<Poll> =>
    apiFetch(`${BASE}/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updatePoll: (pollId: string, patch: Record<string, unknown>): Promise<Poll> =>
    apiFetch(`${BASE}/polls/${pollId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(r => r.json()),

  deletePoll: (pollId: string): Promise<void> =>
    apiFetch(`${BASE}/polls/${pollId}`, { method: "DELETE" }).then(() => undefined),

  votePoll: (pollId: string, optionId: string): Promise<Poll> =>
    apiFetch(`${BASE}/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    }).then(r => r.json()),

  aiGeneratePoll: (topic: string): Promise<Poll> =>
    apiFetch(`${BASE}/polls/ai-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    }).then(r => r.json()),

  // ── Live Rooms ──
  getLiveRooms: (): Promise<LiveRoom[]> =>
    apiFetch(`${BASE}/live-rooms`).then(r => r.json()),

  createLiveRoom: (data: { title: string; topic: string; moderator: string }): Promise<LiveRoom> =>
    apiFetch(`${BASE}/live-rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateLiveRoom: (roomId: string, patch: Record<string, unknown>): Promise<LiveRoom> =>
    apiFetch(`${BASE}/live-rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(r => r.json()),

  endLiveRoom: (roomId: string): Promise<void> =>
    apiFetch(`${BASE}/live-rooms/${roomId}/end`, { method: "POST" }).then(() => undefined),

  joinLiveRoom: (roomId: string): Promise<void> =>
    apiFetch(`${BASE}/live-rooms/${roomId}/join`, { method: "POST" }).then(() => undefined),

  sendLiveMessage: (roomId: string, text: string, author: string): Promise<LiveMessage> =>
    apiFetch(`${BASE}/live-rooms/${roomId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author }),
    }).then(r => r.json()),

  deleteLiveMessage: (roomId: string, messageId: string): Promise<void> =>
    apiFetch(`${BASE}/live-rooms/${roomId}/messages/${messageId}`, { method: "DELETE" }).then(() => undefined),

  aiRoomSummary: (roomId: string): Promise<{ summary: string; keyPoints: string[]; actionItems: string[] }> =>
    apiFetch(`${BASE}/live-rooms/${roomId}/ai-summary`).then(r => r.json()),

  // ── AI Mentor ──
  aiMentor: (message: string, context?: string): Promise<{ reply: string }> =>
    apiFetch(`${BASE}/ai-mentor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    }).then(r => r.json()),

  // ── AI Feed Summary ──
  aiSummariseFeed: (category?: string): Promise<{ digest: string; hotTopics: string[] }> =>
    apiFetch(`${BASE}/ai-summarise-feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }).then(r => r.json()),
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["Digital Safety", "Business", "Government", "Health", "Legal", "Finance", "General"];

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({
  post, onReact, onComment, isAdmin,
  onDelete, onPatch, onRemoveComments, onEdit,
}: {
  post: Post;
  onReact: (type: keyof Reaction) => void;
  onComment: (text: string) => Promise<Comment>;
  isAdmin: boolean;
  onDelete: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemoveComments: () => void;
  onEdit: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>(post.comments);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(post.text);
  const [aiMod, setAiMod] = useState<{ safe: boolean; flag: string; suggestion: string } | null>(null);
  const [loadingMod, setLoadingMod] = useState(false);

  useEffect(() => { setComments(post.comments); }, [post.comments]);
  useEffect(() => { if (!editing) setDraftText(post.text); }, [post.text, editing]);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    const c = await onComment(commentText);
    setComments(prev => [...prev, c]);
    setCommentText("");
  };

  const handleAiModerate = async () => {
    setLoadingMod(true);
    try {
      const result = await API.aiModeratePost(post.id);
      setAiMod(result);
    } finally {
      setLoadingMod(false);
    }
  };

  return (
    <motion.div
      className={`glass-strip p-6 ${post.highlighted ? "border border-accent/40 bg-accent/5" : ""} ${post.pinned ? "ring-1 ring-amber-400/30" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-serif font-bold text-sm border border-white/10">
          {post.anonymous ? "?" : post.author[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-none mb-1">{post.anonymous ? "Anonymous" : post.author}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">{post.category}</span>
            <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
          {(post.pinned || post.highlighted || post.resolved || post.reviewed) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {post.pinned && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200">Pinned</span>}
              {post.highlighted && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent">Highlighted</span>}
              {post.resolved && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-400/15 border border-green-400/30 text-green-300">Resolved</span>}
              {post.reviewed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-400/15 border border-sky-400/30 text-sky-200">Reviewed</span>}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mb-3">
          <textarea value={draftText} onChange={e => setDraftText(e.target.value)} className="glass-input min-h-[90px]" />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button onClick={() => { setEditing(false); setDraftText(post.text); }} className="glass-pill text-[11px] px-3 py-1.5">Cancel</button>
            <button onClick={() => { onEdit(draftText); setEditing(false); }} disabled={!draftText.trim()} className="glass-pill-primary text-[11px] px-3 py-1.5 disabled:opacity-40">Save</button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed mb-3">{post.text}</p>
      )}

      {post.image && (
        <img src={post.image} alt="post" className="w-full rounded-xl mb-3 object-cover max-h-56 border border-white/10" />
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        {(["heart", "handshake", "star"] as const).map(type => {
          const emojis = { heart: "💖", handshake: "🤝", star: "🌟" };
          return (
            <button key={type} onClick={() => onReact(type)} className="flex items-center gap-1 hover:scale-110 transition-transform active:scale-95">
              {emojis[type]} <span>{post.reactions[type]}</span>
            </button>
          );
        })}
        <button onClick={() => setExpanded(!expanded)} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
          💬 {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </button>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
          <button onClick={() => onPatch({ pinned: !post.pinned })} className="glass-pill text-[11px] px-2.5 py-1">{post.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={() => onPatch({ highlighted: !post.highlighted })} className="glass-pill text-[11px] px-2.5 py-1">{post.highlighted ? "Unhighlight" : "Highlight"}</button>
          <button onClick={() => setEditing(true)} className="glass-pill text-[11px] px-2.5 py-1">Edit</button>
          <button onClick={() => onPatch({ resolved: !post.resolved })} className="glass-pill text-[11px] px-2.5 py-1">{post.resolved ? "Unmark Resolved" : "Resolve"}</button>
          <button onClick={() => onPatch({ reviewed: !post.reviewed })} className="glass-pill text-[11px] px-2.5 py-1">{post.reviewed ? "Unmark Reviewed" : "Review"}</button>
          <button onClick={onRemoveComments} className="glass-pill text-[11px] px-2.5 py-1">Clear Comments</button>
          <button onClick={handleAiModerate} disabled={loadingMod} className="glass-pill text-[11px] px-2.5 py-1 border-purple-400/30 bg-purple-400/10 text-purple-300 hover:bg-purple-400/20 disabled:opacity-40">
            {loadingMod ? "Checking…" : "🤖 AI Moderate"}
          </button>
          <button onClick={onDelete} className="glass-pill text-[11px] px-2.5 py-1 text-red-300 border border-red-400/30 bg-red-400/10 hover:bg-red-400/20">Delete</button>
        </div>
      )}

      {aiMod && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className={`rounded-xl border px-4 py-3 mb-3 text-xs ${aiMod.safe ? "border-green-400/30 bg-green-400/5 text-green-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}
        >
          <p className="font-semibold mb-1">🤖 AI Moderation: {aiMod.flag}</p>
          <p>{aiMod.suggestion}</p>
          <button onClick={() => setAiMod(null)} className="mt-2 text-[10px] opacity-50 hover:opacity-100">Dismiss</button>
        </motion.div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-white/10 pt-3 space-y-2 mb-3">
              {comments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first!</p>}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <span className="font-semibold shrink-0">{c.author}:</span>
                  <span className="text-muted-foreground">{c.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleComment()} placeholder="Write a comment..." className="glass-input text-xs py-2 flex-1" />
              <button onClick={handleComment} className="glass-pill-primary text-xs px-3 py-2">Send</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── AIMentorPanel ────────────────────────────────────────────────────────────
function AIMentorPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { reply } = await API.aiMentor(q);
      setMessages(prev => [...prev, { role: "ai", text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Sorry, I couldn't connect right now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="glass-glow p-4 w-80 mb-3 rounded-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">🤖 Saheli AI Mentor</p>
                <p className="text-xs text-muted-foreground">Ask about safety, rights, business & more</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs hover:bg-white/20">✕</button>
            </div>
            <div className="h-48 overflow-y-auto space-y-2 mb-3 pr-1">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Hi! Ask me anything about digital safety, legal rights, or starting a business.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-xs p-2 rounded-xl ${m.role === "user" ? "bg-accent/10 border border-accent/20 text-right ml-6" : "bg-white/5 border border-white/10 mr-6"}`}>
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="text-xs p-2 rounded-xl bg-white/5 border border-white/10 mr-6 text-muted-foreground animate-pulse">Thinking…</div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder="Type your question…"
                className="glass-input text-xs py-2 flex-1"
              />
              <button onClick={handleSend} disabled={loading || !input.trim()} className="glass-pill-primary text-xs px-3 py-2 disabled:opacity-40">→</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-12 h-12 rounded-full glass-pill-primary flex items-center justify-center text-xl shadow-lg"
      >
        🤖
      </button>
    </div>
  );
}

// ─── FeedDigest ───────────────────────────────────────────────────────────────
function FeedDigest({ category }: { category?: string }) {
  const [digest, setDigest] = useState<{ digest: string; hotTopics: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await API.aiSummariseFeed(category);
      setDigest(d);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-strip p-4 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">✨ AI Community Digest</p>
        <button onClick={load} disabled={loading} className="glass-pill text-xs px-3 py-1.5 disabled:opacity-40">
          {loading ? "Loading…" : "Generate"}
        </button>
      </div>
      {digest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
          <p className="text-sm mb-2">{digest.digest}</p>
          {digest.hotTopics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {digest.hotTopics.map((t, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/25 text-accent">{t}</span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── DiscussionTab ────────────────────────────────────────────────────────────
function DiscussionTab({ isAdmin }: { isAdmin: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [anonymous, setAnonymous] = useState(false);
  const [image, setImage] = useState<string | undefined>();
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [adminFilter, setAdminFilter] = useState("All");
  const [highlightOnly, setHighlightOnly] = useState(false);

  useEffect(() => {
    API.getPosts().then(d => { setPosts(d); setLoading(false); });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const created = await API.createPost({
        author: anonymous ? "Anonymous" : "You",
        text, category, anonymous, image,
      });
      setPosts(prev => [created, ...prev]);
      setText(""); setImage(undefined); setAnonymous(false);
    } finally { setPosting(false); }
  };

  const handleReact = async (postId: string, type: keyof Reaction) => {
    const updatedReactions = await API.reactToPost(postId, type);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions: updatedReactions } : p));
  };

  const handleComment = async (postId: string, commentText: string): Promise<Comment> => {
    const c = await API.addComment(postId, commentText, "You");
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: [...p.comments, c] } : p));
    return c;
  };

  const handlePatch = async (postId: string, patch: Record<string, unknown>) => {
    const updated = await API.updatePost(postId, patch);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updated } : p));
  };

  const handleDeletePost = async (postId: string) => {
    await API.deletePost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleRemoveComments = async (postId: string) => {
    await API.removeAllComments(postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: [] } : p));
  };

  const handleEditPost = async (postId: string, nextText: string) => {
    const updated = await API.updatePost(postId, { text: nextText });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updated } : p));
  };

  const filteredPosts = posts
    .filter(p => (!isAdmin || adminFilter === "All") ? true : p.category === adminFilter)
    .filter(p => (!isAdmin || !highlightOnly) ? true : p.highlighted);

  const orderedPosts = isAdmin
    ? [
      ...filteredPosts.filter(p => p.pinned),
      ...filteredPosts.filter(p => !p.pinned),
    ]
    : filteredPosts;

  return (
    <div>
      <FeedDigest />

      <div className="glass-glow p-6 mb-6">
        <h3 className="font-serif font-bold text-base mb-4">Share with the community</h3>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind? Ask a question, share a tip, or start a discussion..." className="glass-input min-h-[90px] mb-3" />
        {image && (
          <div className="relative mb-3">
            <img src={image} alt="preview" className="rounded-xl w-full max-h-40 object-cover border border-white/10" />
            <button onClick={() => setImage(undefined)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">✕</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={category} onChange={e => setCategory(e.target.value)} className="glass-input text-sm py-2 flex-1 min-w-[140px]">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} className="glass-pill text-sm flex items-center gap-1.5">📎 Image</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        </div>
        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <span onClick={() => setAnonymous(!anonymous)} className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${anonymous ? "bg-accent" : "bg-white/10"}`}>
              <span className={`w-4 h-4 rounded-full bg-white transition-transform ${anonymous ? "translate-x-4" : "translate-x-0"}`} />
            </span>
            Post anonymously
          </label>
          <button onClick={handlePost} disabled={posting || !text.trim()} className="glass-pill-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {posting ? "Posting..." : "Post →"}
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="glass-glow p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
            <p className="font-semibold text-sm">Moderation Controls</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter</span>
              <select value={adminFilter} onChange={e => setAdminFilter(e.target.value)} className="glass-input text-xs py-2">
                <option value="All">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={() => setHighlightOnly(v => !v)} className={`glass-pill text-xs px-3 py-1.5 ${highlightOnly ? "border-accent/40 bg-accent/10" : ""}`}>
              {highlightOnly ? "Showing highlighted" : "Show highlighted only"}
            </button>
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span>Pinned: {posts.filter(p => p.pinned).length}</span>
              <span>Resolved: {posts.filter(p => p.resolved).length}</span>
              <span>Reviewed: {posts.filter(p => p.reviewed).length}</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-strip p-6 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2"><div className="h-3 bg-white/10 rounded w-24" /><div className="h-2 bg-white/10 rounded w-16" /></div>
              </div>
              <div className="space-y-2"><div className="h-3 bg-white/10 rounded w-full" /><div className="h-3 bg-white/10 rounded w-3/4" /></div>
            </div>
          ))}
        </div>
      ) : orderedPosts.length === 0 ? (
        <div className="glass-strip p-12 text-center">
          <p className="text-3xl mb-3">💬</p>
          <p className="font-semibold mb-1">{posts.length === 0 ? "No posts yet" : "No posts match the filters"}</p>
          <p className="text-sm text-muted-foreground">{posts.length === 0 ? "Be the first to start a conversation!" : "Try adjusting the moderation filters above."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onReact={type => handleReact(post.id, type)}
              onComment={text => handleComment(post.id, text)}
              isAdmin={isAdmin}
              onDelete={() => handleDeletePost(post.id)}
              onPatch={patch => handlePatch(post.id, patch)}
              onRemoveComments={() => handleRemoveComments(post.id)}
              onEdit={nextText => handleEditPost(post.id, nextText)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CreateRoomModal ──────────────────────────────────────────────────────────
function CreateRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (room: LiveRoom) => void }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const room = await API.createLiveRoom({ title, topic, moderator: "Admin" });
      onCreate(room);
      onClose();
    } finally { setCreating(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        className="relative z-10 glass-glow p-6 w-full max-w-md rounded-2xl"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 20 }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif font-bold text-lg">Create Live Room</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs hover:bg-white/20">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Room Title <span className="text-red-400">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Online Safety Q&A" className="glass-input w-full" autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Topic / Description <span className="opacity-60">(optional)</span></label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Tips on avoiding UPI scams" className="glass-input w-full" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="glass-pill text-sm flex-1">Cancel</button>
          <button onClick={handleCreate} disabled={creating || !title.trim()} className="glass-pill-primary text-sm flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            {creating ? <><span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />Creating…</> : <><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Go Live</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── LiveRoomChat ─────────────────────────────────────────────────────────────

// VideoTile
function VideoTile({
  name,
  stream,
  videoOn,
  muted = false,
}: {
  name: string;
  stream: MediaStream | null;
  videoOn: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null;
    }
  }, [stream]);

  const showPlaceholder = !stream || !videoOn;
  const placeholderText = videoOn ? "Connecting video..." : "Camera off";

  return (
    <div className="relative aspect-video bg-black/30 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
      {stream && (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${videoOn ? "" : "opacity-30"}`}
        />
      )}
      {showPlaceholder && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {placeholderText}
        </span>
      )}
      <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-full bg-black/50 text-white border border-white/20">
        {name}
      </div>
    </div>
  );
}

function LiveRoomChat({ room, isAdmin, onLeave, onEnd }: { room: LiveRoom; isAdmin: boolean; onLeave: () => void; onEnd: () => void }) {
  const auth = getAuth();
  const displayName = (
    auth?.name ||
    auth?.email?.split("@")[0] ||
    (isAdmin ? "Admin" : "Guest")
  ).trim() || (isAdmin ? "Admin" : "Guest");
  const [messages, setMessages] = useState<LiveMessage[]>(room.messages);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ summary: string; keyPoints: string[]; actionItems: string[] } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [remoteTiles, setRemoteTiles] = useState<Array<{ id: string; name: string; stream: MediaStream | null; video: boolean }>>([]);
  const [autoStartDone, setAutoStartDone] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const participantsRef = useRef<LiveParticipant[]>([]);
  const selfIdRef = useRef<string>("");
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    API.joinLiveRoom(room.id).catch(() => {});
    const sys: LiveMessage = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      author: "System",
      text: isAdmin ? "You started this room." : "You joined the room.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSystem: true,
    };
    setMessages(prev => [...prev, sys]);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room.id, isAdmin]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [localStream]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const participantCount = participants.length || room.participants;

  const addSystem = (text: string) => setMessages(prev => [...prev, {
    id: crypto.randomUUID?.() ?? `${Date.now()}`,
    author: "System", text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    isSystem: true,
  }]);


  const syncRemoteTiles = (nextParticipants?: LiveParticipant[]) => {
    const list = nextParticipants ?? participantsRef.current;
    const selfId = selfIdRef.current;
    const tiles = list
      .filter(p => p.id !== selfId)
      .map(p => ({
        id: p.id,
        name: p.name,
        video: p.video,
        stream: remoteStreamsRef.current[p.id] ?? null,
      }));
    setRemoteTiles(tiles);
  };

  const cleanupPeer = (peerId: string) => {
    const pc = peersRef.current[peerId];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    delete peersRef.current[peerId];
    delete remoteStreamsRef.current[peerId];
    syncRemoteTiles();
  };

  const addLocalTracks = (pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const existing = pc.getSenders().map(s => s.track?.id).filter(Boolean) as string[];
    stream.getTracks().forEach(track => {
      if (!existing.includes(track.id)) {
        pc.addTrack(track, stream);
      }
    });
  };

  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current[peerId] = pc;

    pc.onicecandidate = event => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("webrtc_ice", {
          room_id: room.id,
          target_id: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = event => {
      const [stream] = event.streams;
      if (stream) {
        remoteStreamsRef.current[peerId] = stream;
        syncRemoteTiles();
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        cleanupPeer(peerId);
      }
    };

    addLocalTracks(pc);
    return pc;
  };

  const sendOffer = async (peerId: string, pc: RTCPeerConnection) => {
    const socket = socketRef.current;
    if (!socket) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc_offer", {
      room_id: room.id,
      target_id: peerId,
      offer,
      from_name: displayName,
    });
  };

  const handleParticipants = (list: LiveParticipant[]) => {
    participantsRef.current = list;
    setParticipants(list);

    const nextIds = new Set(list.map(p => p.id));
    Object.keys(peersRef.current).forEach(id => {
      if (!nextIds.has(id)) cleanupPeer(id);
    });

    const selfId = selfIdRef.current;
    list.forEach(p => {
      if (!selfId || p.id === selfId) return;
      if (!peersRef.current[p.id]) {
        const pc = createPeerConnection(p.id);
        if (selfId > p.id) {
          sendOffer(p.id, pc).catch(() => {});
        }
      }
    });

    syncRemoteTiles(list);
  };

  useEffect(() => {
    if (!SOCKET_URL) return;
    const socket = io(SOCKET_URL, { transports: ["polling"], upgrade: false });
    socketRef.current = socket;

    socket.on("connect", () => {
      selfIdRef.current = socket.id;
      socket.emit("live_room_join", {
        room_id: room.id,
        user: displayName,
        video: camOn,
      });
    });

    socket.on("room_participants", (payload: { room_id?: string; participants?: LiveParticipant[] }) => {
      if (payload?.room_id && payload.room_id !== room.id) return;
      if (Array.isArray(payload?.participants)) {
        handleParticipants(payload.participants);
      }
    });

    socket.on("chat_message", (payload: { room_id?: string; message?: LiveMessage } | LiveMessage) => {
      const msg = (payload as { message?: LiveMessage })?.message ?? (payload as LiveMessage);
      const roomId = (payload as { room_id?: string })?.room_id;
      if (roomId && roomId !== room.id) return;
      if (!msg?.id) return;
      const normalized: LiveMessage = {
        ...msg,
        author: msg.author?.trim() || "Guest",
        time: msg.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => (prev.some(m => m.id === normalized.id) ? prev : [...prev, normalized]));
    });

    socket.on("webrtc_offer", async (payload: { room_id?: string; from?: string; offer?: RTCSessionDescriptionInit }) => {
      if (payload?.room_id && payload.room_id !== room.id) return;
      if (!payload?.from || !payload?.offer) return;
      const pc = peersRef.current[payload.from] ?? createPeerConnection(payload.from);
      try {
        await pc.setRemoteDescription(payload.offer);
        addLocalTracks(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc_answer", {
          room_id: room.id,
          target_id: payload.from,
          answer,
        });
      } catch {
        // ignore
      }
    });

    socket.on("webrtc_answer", async (payload: { room_id?: string; from?: string; answer?: RTCSessionDescriptionInit }) => {
      if (payload?.room_id && payload.room_id !== room.id) return;
      if (!payload?.from || !payload?.answer) return;
      const pc = peersRef.current[payload.from];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(payload.answer);
      } catch {
        // ignore
      }
    });

    socket.on("webrtc_ice", async (payload: { room_id?: string; from?: string; candidate?: RTCIceCandidateInit }) => {
      if (payload?.room_id && payload.room_id !== room.id) return;
      if (!payload?.from || !payload?.candidate) return;
      const pc = peersRef.current[payload.from];
      if (!pc) return;
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        // ignore
      }
    });

    socket.on("connect_error", () => {
      addSystem("Live video connection failed.");
    });

    return () => {
      socket.emit("live_room_leave", { room_id: room.id });
      socket.disconnect();
      socketRef.current = null;
      Object.keys(peersRef.current).forEach(id => cleanupPeer(id));
      participantsRef.current = [];
      setParticipants([]);
      setRemoteTiles([]);
      selfIdRef.current = "";
    };
  }, [room.id, displayName]);

  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("live_room_video", { room_id: room.id, video: camOn });
  }, [camOn, room.id]);

  useEffect(() => {
    if (autoStartDone) return;
    setAutoStartDone(true);
    ensureStream()
      .then(stream => {
        const track = stream.getVideoTracks()[0];
        if (track) {
          track.enabled = true;
          setCamOn(true);
          socketRef.current?.emit("live_room_video", { room_id: room.id, video: true });
          addTracksToPeers();
          renegotiateAll();
        }
      })
      .catch(() => {
        addSystem("Camera permission denied or not supported.");
      });
  }, [autoStartDone]);

  useEffect(() => {
    if (!localStream) return;
    addTracksToPeers();
    if (Object.keys(peersRef.current).length > 0) {
      renegotiateAll();
    }
  }, [localStream]);

  const addTracksToPeers = () => {
    Object.values(peersRef.current).forEach(pc => addLocalTracks(pc));
  };

  const renegotiateAll = async () => {
    const entries = Object.entries(peersRef.current);
    for (const [peerId, pc] of entries) {
      try {
        await sendOffer(peerId, pc);
      } catch {
        // ignore
      }
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const msg = await API.sendLiveMessage(room.id, message, displayName);
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      setMessage("");
    } finally { setSending(false); }
  };

  const handleRemoveMessage = async (messageId: string) => {
    await API.deleteLiveMessage(room.id, messageId).catch(() => {});
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const ensureStream = async () => {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setCamOn(stream.getVideoTracks().some(t => t.enabled));
    setMicOn(stream.getAudioTracks().some(t => t.enabled));
    return stream;
  };

  const handleToggleCamera = async () => {
    try {
      const stream = await ensureStream();
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const next = !track.enabled;
      track.enabled = next;
      setCamOn(next);
      socketRef.current?.emit("live_room_video", { room_id: room.id, video: next });
      if (next) {
        addTracksToPeers();
        await renegotiateAll();
      }
    } catch {
      addSystem("Camera permission denied or not supported.");
    }
  };

  const handleToggleMic = async () => {
    try {
      const stream = await ensureStream();
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      const next = !track.enabled;
      track.enabled = next;
      setMicOn(next);
      if (next) {
        addTracksToPeers();
        await renegotiateAll();
      }
    } catch {
      addSystem("Microphone permission denied or not supported.");
    }
  };

  const stopMedia = () => {
    localStream?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setCamOn(false);
    setMicOn(false);
    socketRef.current?.emit("live_room_video", { room_id: room.id, video: false });
  };

  const handleToggleMute = (author: string) => {
    if (author === "Admin" || author === "System") return;
    setMutedUsers(prev => {
      const isMuted = prev.includes(author);
      addSystem(`${author} ${isMuted ? "was unmuted" : "was muted"} by admin.`);
      return isMuted ? prev.filter(u => u !== author) : [...prev, author];
    });
  };

  const handleAiSummary = async () => {
    setLoadingSummary(true);
    try {
      const s = await API.aiRoomSummary(room.id);
      setSummary(s);
    } finally { setLoadingSummary(false); }
  };

  const handleEnd = async () => {
    await API.endLiveRoom(room.id);
    stopMedia();
    onEnd();
  };

  return (
    <motion.div className="glass-glow p-6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">{room.title}</h3>
            <p className="text-xs text-muted-foreground">Moderated by {room.moderator}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">👥 {participantCount}</span>
          <span className="font-mono text-xs text-accent">⏱ {fmt(elapsed)}</span>
          {isAdmin && (
            <button onClick={handleAiSummary} disabled={loadingSummary} className="text-xs px-3 py-1.5 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40">
              {loadingSummary ? "…" : "🤖 Summary"}
            </button>
          )}
          {isAdmin ? (
            <button onClick={handleEnd} className="text-xs px-3 py-1.5 rounded-full bg-red-500/15 border border-red-400/30 text-red-400 hover:bg-red-500/25">End for everyone</button>
          ) : (
            <button onClick={() => { stopMedia(); onLeave(); }} className="text-xs px-3 py-1.5 rounded-full bg-white/10 border border-white/15 hover:bg-white/15">Leave</button>
          )}
        </div>
      </div>

      {room.topic && <p className="text-xs text-muted-foreground mb-4 pl-6 border-l border-accent/30">📌 {room.topic}</p>}

      <div className="glass p-4 rounded-xl border border-white/10 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Live Camera</p>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleCamera} className="text-[11px] px-3 py-1.5 rounded-full bg-white/10 border border-white/15 hover:bg-white/15">
              {camOn ? "Camera On" : "Camera Off"}
            </button>
            <button onClick={handleToggleMic} className="text-[11px] px-3 py-1.5 rounded-full bg-white/10 border border-white/15 hover:bg-white/15">
              {micOn ? "Mic On" : "Mic Off"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <VideoTile name={`${displayName} (You)`} stream={localStream} videoOn={camOn} muted />
          {remoteTiles.map(tile => (
            <VideoTile key={tile.id} name={tile.name} stream={tile.stream} videoOn={tile.video} />
          ))}
        </div>
      </div>

      {summary && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass p-4 rounded-xl border border-purple-400/20 bg-purple-400/5 mb-4 text-xs">
          <p className="font-semibold text-purple-300 mb-1">🤖 AI Summary</p>
          <p className="mb-2">{summary.summary}</p>
          {summary.keyPoints.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 mb-2 text-muted-foreground">
              {summary.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
            </ul>
          )}
          {summary.actionItems.length > 0 && (
            <div><p className="font-semibold mb-1">Action items:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                {summary.actionItems.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          <button onClick={() => setSummary(null)} className="mt-2 opacity-50 hover:opacity-100">Dismiss</button>
        </motion.div>
      )}

      <div ref={chatRef} className="glass p-4 h-64 overflow-y-auto space-y-3 mb-4 rounded-xl border border-white/10">
        {messages.map(msg => {
          if (msg.isSystem) return (
            <div key={msg.id} className="text-center text-muted-foreground italic text-xs">{msg.text}</div>
          );
          const isSelf = msg.author?.trim().toLowerCase() === displayName.toLowerCase();
          const authorLabel = isSelf ? "You" : (msg.author || "Guest");
          const isMuted = mutedUsers.includes(msg.author);
          const canMod = isAdmin && !isSelf && msg.author !== "System";
          return (
            <div key={msg.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className={`font-semibold ${isSelf || msg.author === "Admin" ? "text-accent" : ""}`}>{authorLabel}</span>
                <span className="text-muted-foreground ml-1 text-xs">{msg.time}</span>
                {isMuted && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-400/10 border border-red-400/30 text-red-300">Muted</span>}
                <span className="ml-2">{msg.text}</span>
              </div>
              {canMod && (
                <div className="flex items-center gap-1 shrink-0 text-[10px]">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
                  <button onClick={() => handleRemoveMessage(msg.id)} className="px-2 py-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10">Remove</button>
                  <button onClick={() => handleToggleMute(msg.author)} className="px-2 py-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10">{isMuted ? "Unmute" : "Mute"}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Type a message… (Enter to send)" className="glass-input flex-1 text-sm" />
        <button onClick={handleSend} disabled={sending || !message.trim()} className="glass-pill-primary text-sm px-4 disabled:opacity-40">Send</button>
      </div>
    </motion.div>
  );
}

// ─── LiveRoomTab ──────────────────────────────────────────────────────────────
function LiveRoomTab({ isAdmin }: { isAdmin: boolean }) {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<LiveRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    API.getLiveRooms().then(d => { setRooms(d); setLoading(false); });
  }, []);

  const handleRoomCreated = (room: LiveRoom) => {
    setRooms(prev => [room, ...prev]);
    setActiveRoom(room);
  };

  const handleEndRoom = async (roomId: string) => {
    await API.endLiveRoom(roomId);
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isActive: false } : r));
    if (activeRoom?.id === roomId) setActiveRoom(null);
  };

  const handleEndAll = async () => {
    const active = rooms.filter(r => r.isActive);
    await Promise.all(active.map(r => API.endLiveRoom(r.id).catch(() => {})));
    setRooms(prev => prev.map(r => ({ ...r, isActive: false })));
    setActiveRoom(null);
  };

  const handleStartRoom = async (roomId: string) => {
    await API.updateLiveRoom(roomId, { isActive: true });
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isActive: true } : r));
  };

  const activeCount = rooms.filter(r => r.isActive).length;

  if (activeRoom) {
    return (
      <LiveRoomChat
        room={activeRoom}
        isAdmin={isAdmin}
        onLeave={() => setActiveRoom(null)}
        onEnd={() => { handleEndRoom(activeRoom.id); }}
      />
    );
  }

  return (
    <div>
      {isAdmin && (
        <motion.div className="glass-glow p-5 mb-6 flex flex-wrap items-center justify-between gap-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
              <p className="font-semibold text-sm">Live Room Controls</p>
            </div>
            <p className="text-xs text-muted-foreground">Active: {activeCount} · Total: {rooms.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(true)} className="glass-pill-primary text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Create Room
            </button>
            {activeCount > 0 && (
              <button onClick={handleEndAll} className="glass-pill text-sm px-4 py-2 text-red-300 border border-red-400/30 bg-red-400/10 hover:bg-red-400/20">End All Rooms</button>
            )}
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="glass-strip p-5 animate-pulse flex gap-4 items-center">
              <div className="w-11 h-11 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2"><div className="h-3 bg-white/10 rounded w-40" /><div className="h-2 bg-white/10 rounded w-28" /></div>
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="glass-strip p-12 text-center">
          <p className="text-3xl mb-3">🎙️</p>
          <p className="font-semibold mb-1">No live rooms right now</p>
          <p className="text-sm text-muted-foreground">{isAdmin ? "Create a room above!" : "Check back later."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            <motion.div key={room.id} className="glass-strip p-5 flex items-center gap-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: room.isActive ? 1 : 0.45, y: 0 }} transition={{ delay: i * 0.06 }}>
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-full bg-primary/20 border border-white/10 flex items-center justify-center font-serif font-bold">{room.moderator[0]}</div>
                {room.isActive && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-background" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-sm truncate">{room.title}</p>
                  {!room.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground shrink-0">Ended</span>}
                </div>
                {room.topic && <p className="text-xs text-muted-foreground truncate">{room.topic}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">by {room.moderator}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">👥 {room.participants}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>}
                {room.isActive ? (
                  <>
                    {isAdmin && <button onClick={() => handleEndRoom(room.id)} className="glass-pill text-[11px] px-3 py-1.5 text-red-300 border border-red-400/30 bg-red-400/10 hover:bg-red-400/20">End</button>}
                    <button onClick={() => setActiveRoom(room)} className="glass-pill-primary text-xs px-4 py-2 shrink-0 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Join
                    </button>
                  </>
                ) : (
                  isAdmin && <button onClick={() => handleStartRoom(room.id)} className="glass-pill text-[11px] px-3 py-1.5">Start Session</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={handleRoomCreated} />}
      </AnimatePresence>
    </div>
  );
}

// ─── PollTab ──────────────────────────────────────────────────────────────────
function PollTab({ isAdmin }: { isAdmin: boolean }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState<Record<string, string>>({});
  const [voting, setVoting] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>(["", ""]);
  const [aiTopic, setAiTopic] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [editPollId, setEditPollId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ question: string; description: string; options: string[] } | null>(null);

  useEffect(() => { API.getPolls().then(d => { setPolls(d); setLoading(false); }); }, []);

  const handleVote = async (pollId: string, optionId: string) => {
    if (voted[pollId] || voting) return;
    setVoting(optionId);
    try {
      const updated = await API.votePoll(pollId, optionId);
      setPolls(prev => prev.map(p => p.id === pollId ? updated : p));
      setVoted(prev => ({ ...prev, [pollId]: optionId }));
    } catch {
      // Optimistic fallback
      setPolls(prev => prev.map(p => p.id !== pollId ? p : {
        ...p, totalVotes: p.totalVotes + 1,
        options: p.options.map(o => o.id === optionId ? { ...o, votes: o.votes + 1 } : o),
      }));
      setVoted(prev => ({ ...prev, [pollId]: optionId }));
    } finally { setVoting(null); }
  };

  const handleCreatePoll = async () => {
    const cleaned = draftOptions.map(o => o.trim()).filter(Boolean);
    if (!draftQuestion.trim() || cleaned.length < 2) return;
    const poll = await API.createPoll({ question: draftQuestion.trim(), description: draftDescription.trim() || "Community poll", options: cleaned });
    setPolls(prev => [poll, ...prev]);
    setDraftQuestion(""); setDraftDescription(""); setDraftOptions(["", ""]);
  };

  const handleAiGeneratePoll = async () => {
    if (!aiTopic.trim()) return;
    setGeneratingAi(true);
    try {
      const poll = await API.aiGeneratePoll(aiTopic.trim());
      setPolls(prev => [poll, ...prev]);
      setAiTopic("");
    } catch {
      alert("AI poll generation failed. Please try again.");
    } finally { setGeneratingAi(false); }
  };

  const handleStartEdit = (poll: Poll) => {
    setEditPollId(poll.id);
    setEditDraft({ question: poll.question, description: poll.description, options: poll.options.map(o => o.text) });
  };

  const handleSaveEdit = async () => {
    if (!editPollId || !editDraft) return;
    const cleaned = editDraft.options.map(o => o.trim()).filter(Boolean);
    if (cleaned.length < 2 || !editDraft.question.trim()) return;
    const updated = await API.updatePoll(editPollId, { question: editDraft.question, description: editDraft.description, options: cleaned });
    setPolls(prev => prev.map(p => p.id === editPollId ? updated : p));
    setEditPollId(null); setEditDraft(null);
  };

  const handleClosePoll = async (pollId: string) => {
    const updated = await API.updatePoll(pollId, { closed: true });
    setPolls(prev => prev.map(p => p.id === pollId ? updated : p));
  };

  const handleDeletePoll = async (pollId: string) => {
    await API.deletePoll(pollId);
    setPolls(prev => prev.filter(p => p.id !== pollId));
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="glass-glow p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
            <p className="font-semibold text-sm">Poll Management</p>
          </div>

          {/* AI Generate */}
          <div className="glass p-4 rounded-xl border border-purple-400/20 bg-purple-400/5">
            <p className="text-xs font-semibold text-purple-300 mb-2">🤖 AI-Generate a Scenario Poll</p>
            <div className="flex gap-2">
              <input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="e.g. UPI scams, job fraud, phishing" className="glass-input text-sm flex-1" onKeyDown={e => e.key === "Enter" && handleAiGeneratePoll()} />
              <button onClick={handleAiGeneratePoll} disabled={generatingAi || !aiTopic.trim()} className="glass-pill-primary text-sm px-4 disabled:opacity-40">
                {generatingAi ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>

          {/* Manual create */}
          <div className="space-y-3">
            <input value={draftQuestion} onChange={e => setDraftQuestion(e.target.value)} placeholder="Poll question" className="glass-input" />
            <textarea value={draftDescription} onChange={e => setDraftDescription(e.target.value)} placeholder="Short description (optional)" className="glass-input min-h-[70px]" />
            <div className="space-y-2">
              {draftOptions.map((opt, idx) => (
                <input key={`draft-${idx}`} value={opt} onChange={e => setDraftOptions(prev => prev.map((o, i) => i === idx ? e.target.value : o))} placeholder={`Option ${idx + 1}`} className="glass-input" />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setDraftOptions(prev => [...prev, ""])} className="glass-pill text-xs px-3 py-1.5">+ Add option</button>
              <button onClick={handleCreatePoll} disabled={!draftQuestion.trim() || draftOptions.filter(o => o.trim()).length < 2} className="glass-pill-primary text-xs px-4 py-1.5 disabled:opacity-40">Publish Poll</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-glow p-8 animate-pulse"><div className="h-5 bg-white/10 rounded w-2/3 mb-4" /><div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/10 rounded-xl" />)}</div></div>
      ) : polls.length === 0 ? (
        <div className="glass-strip p-12 text-center"><p className="text-3xl mb-3">📊</p><p className="font-semibold mb-1">No active polls</p><p className="text-sm text-muted-foreground">Check back later for scenario-based polls!</p></div>
      ) : (
        polls.map(poll => {
          const userVote = voted[poll.id];
          const total = poll.totalVotes;
          return (
            <motion.div key={poll.id} className="glass-glow p-6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-serif font-bold text-base">{poll.question}</h3>
                {poll.closed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-400/15 border border-red-400/30 text-red-300">Closed</span>}
              </div>
              <p className="text-sm text-muted-foreground mb-5">{poll.description}</p>
              <div className="space-y-3">
                {poll.options.map(opt => {
                  const pct = total === 0 ? 0 : Math.round((opt.votes / total) * 100);
                  const isVoted = userVote === opt.id;
                  const revealed = !!userVote || isAdmin || poll.closed;
                  return (
                    <button key={opt.id} onClick={() => handleVote(poll.id, opt.id)} disabled={!!userVote || poll.closed}
                      className={`w-full text-left relative overflow-hidden rounded-xl border transition-all ${isVoted ? "border-accent/60 bg-accent/10" : opt.safe && revealed ? "border-green-400/40 bg-green-400/5" : "border-white/10 bg-white/5"} ${!userVote && !poll.closed ? "hover:border-accent/40 hover:bg-accent/5 cursor-pointer" : "cursor-default"} px-4 py-3 flex justify-between items-center gap-3`}>
                      {revealed && <span className={`absolute inset-0 origin-left transition-all duration-700 ${opt.safe ? "bg-green-400/10" : "bg-white/5"}`} style={{ width: `${pct}%` }} />}
                      <span className="relative text-sm z-10 flex items-center gap-2">
                        {isVoted && <span>✓</span>}
                        {opt.safe && revealed && !isVoted && <span className="text-green-400 text-xs">✓ Safer choice</span>}
                        {opt.text}
                      </span>
                      {revealed && <span className="relative z-10 text-xs text-muted-foreground font-mono shrink-0">{pct}%</span>}
                    </button>
                  );
                })}
              </div>
              {(userVote || isAdmin || poll.closed) && <p className="text-xs text-muted-foreground mt-3 text-center">{poll.totalVotes} votes total</p>}

              {isAdmin && editPollId === poll.id && editDraft && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span><p className="text-xs font-semibold">Edit Poll</p></div>
                  <input value={editDraft.question} onChange={e => setEditDraft(p => p ? { ...p, question: e.target.value } : p)} className="glass-input" />
                  <textarea value={editDraft.description} onChange={e => setEditDraft(p => p ? { ...p, description: e.target.value } : p)} className="glass-input min-h-[70px]" />
                  {editDraft.options.map((opt, idx) => (
                    <input key={`edit-${poll.id}-${idx}`} value={opt} onChange={e => setEditDraft(p => p ? { ...p, options: p.options.map((o, i) => i === idx ? e.target.value : o) } : p)} className="glass-input" placeholder={`Option ${idx + 1}`} />
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setEditDraft(p => p ? { ...p, options: [...p.options, ""] } : p)} className="glass-pill text-xs px-3 py-1.5">+ Add option</button>
                    <button onClick={() => { setEditPollId(null); setEditDraft(null); }} className="glass-pill text-xs px-3 py-1.5">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={!editDraft.question.trim() || editDraft.options.filter(o => o.trim()).length < 2} className="glass-pill-primary text-xs px-4 py-1.5 disabled:opacity-40">Save changes</button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent">Admin</span>
                  <button onClick={() => handleStartEdit(poll)} className="glass-pill text-[11px] px-2.5 py-1">Edit</button>
                  {!poll.closed ? (
                    <button onClick={() => handleClosePoll(poll.id)} className="glass-pill text-[11px] px-2.5 py-1 text-red-300 border border-red-400/30 bg-red-400/10">Close</button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Poll closed</span>
                  )}
                  <button onClick={() => handleDeletePoll(poll.id)} className="glass-pill text-[11px] px-2.5 py-1 text-red-300 border border-red-400/30 bg-red-400/10">Delete</button>
                </div>
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const CommunityPage = () => {
  const [tab, setTab] = useState<"discuss" | "live" | "poll">("discuss");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (auth?.role === "admin") {
      setIsAdmin(true);
      return;
    }
    setIsAdmin(false);
    if (!getToken()) return;
    apiFetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const tabs = [
    { id: "discuss" as const, label: "💬 Discussion" },
    { id: "live" as const, label: "🟢 Live Room" },
    { id: "poll" as const, label: "📊 Polls" },
  ];

  return (
    <div className="relative min-h-screen">
      <Navbar />

      <div className="relative z-10 pt-24 section-spacing max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <motion.h1 className="font-serif text-3xl md:text-4xl font-bold mb-2" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            Women Support Network
          </motion.h1>
          <motion.p className="text-muted-foreground text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            Ask questions, share knowledge, and grow together.
          </motion.p>
        </div>

        <div className="flex gap-2 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`glass-tab text-sm relative ${tab === t.id ? "glass-tab-active" : ""}`}>
              {t.label}
              {tab === t.id && <motion.span layoutId="tab-indicator" className="absolute inset-0 rounded-full bg-accent/15 border border-accent/30 -z-10" />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "discuss" && <DiscussionTab isAdmin={isAdmin} />}
            {tab === "live" && <LiveRoomTab isAdmin={isAdmin} />}
            {tab === "poll" && <PollTab isAdmin={isAdmin} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating AI Mentor */}
      <AIMentorPanel />
    </div>
  );
};

export default CommunityPage;
