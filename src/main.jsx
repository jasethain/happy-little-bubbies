import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, db, storage } from './firebase';
import {
  Bell,
  Gift,
  Heart,
  Home,
  Inbox,
  Lock,
  MessageCircle,
  Send,
  ShieldCheck,
  Star,
  Users,
  Settings,
} from 'lucide-react';
import './styles.css';

const FIRST_HELPER_EMAIL = 'jctabdl@yahoo.com.au';


function FriendsImageIcon({ size = 20 }) {
  return (
    <img
      src="/friends-icon.png"
      alt="Friends"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: 'cover',
        flexShrink: 0,
      }}
      draggable={false}
    />
  );
}


const baseRooms = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'inbox', label: 'Private Inbox', icon: Inbox },
  { id: 'friends', label: 'Friends', icon: FriendsImageIcon },
  { id: 'friendChat', label: 'Friend Chat', icon: MessageCircle },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'mentors', label: 'Mentor Lounge', icon: Heart },
  { id: 'stories', label: 'Story Corner', icon: Star },
  { id: 'swap', label: 'Swap Meet', icon: Gift },
  { id: 'safety', label: 'Report a Naughty Baby', icon: ShieldCheck },
  { id: 'profile', label: 'My Bubble', icon: Star },
];

function getRooms(member) {
  if (member?.role === 'admin') {
    return [...baseRooms, { id: 'admin', label: 'Admin Console', icon: Settings }];
  }
  return baseRooms;
}


const routeMap = {
  home: '/',
  chat: '/chat',
  inbox: '/private-inbox',
  friends: '/friends',
  friendChat: '/friend-chat',
  notifications: '/notifications',
  mentors: '/mentor-lounge',
  stories: '/story-corner',
  swap: '/swap-meet',
  safety: '/no-naughty-business',
  profile: '/my-bubble',
  admin: '/admin-console',
};

const reverseRouteMap = Object.entries(routeMap).reduce((acc, [room, path]) => {
  acc[path] = room;
  return acc;
}, {});

function roomFromPath(pathname) {
  return reverseRouteMap[pathname] || 'home';
}

function pathFromRoom(room) {
  return routeMap[room] || '/';
}

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('__');
}

function makeCallRoomId(uidA, uidB) {
  const safePair = [uidA, uidB].sort().join('-').replace(/[^a-zA-Z0-9-]/g, '');
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `happy-little-bubbies-${safePair}-${Date.now()}-${randomPart}`;
}

function callUrlFor(roomId, callType) {
  const audioOnly = callType === 'audio' ? '#config.startWithVideoMuted=true&config.startAudioOnly=true' : '';
  return `https://meet.jit.si/${roomId}${audioOnly}`;
}

function Logo({ goHome }) {
  return (
    <button className="logo-button" onClick={goHome} title="Return home">
      <img src="/logo.png" alt="Happy Little Bubbies logo" />
      <div>
        <h1>Happy Little Bubbies</h1>
        <p>Where every little bubby belongs</p>
      </div>
    </button>
  );
}

function formatDate(value) {
  if (!value?.toDate) return 'just now';
  return value.toDate().toLocaleString();
}

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BUBBY-';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function getUserProfile(uid, email = '') {
  const userQuery = query(
    collection(db, 'users'),
    where('uid', '==', uid),
    limit(1)
  );

  const userResult = await getDocs(userQuery);

  if (!userResult.empty) {
    return {
      id: userResult.docs[0].id,
      ...userResult.docs[0].data(),
    };
  }

  if (email) {
    const emailQuery = query(
      collection(db, 'users'),
      where('email', '==', email.trim().toLowerCase()),
      limit(1)
    );

    const emailResult = await getDocs(emailQuery);

    if (!emailResult.empty) {
      return {
        id: emailResult.docs[0].id,
        ...emailResult.docs[0].data(),
      };
    }

    const helperDoc = await getDoc(doc(db, 'members', 'helper-bubby'));

    if (helperDoc.exists()) {
      const helperData = helperDoc.data();

      if (
        helperData.email &&
        helperData.email.trim().toLowerCase() === email.trim().toLowerCase()
      ) {
        return {
          id: helperDoc.id,
          uid,
          ...helperData,
        };
      }
    }
  }

  return null;
}

async function hasAnyUsers() {
  const result = await getDocs(query(collection(db, 'users'), limit(1)));
  if (!result.empty) return true;
  const members = await getDocs(query(collection(db, 'members'), limit(1)));
  return !members.empty;
}

async function verifyInviteCode(inviteCode) {
  const cleanCode = inviteCode.trim().toUpperCase();
  const inviteQuery = query(
    collection(db, 'inviteCodes'),
    where('code', '==', cleanCode),
    where('used', '==', false),
    limit(1)
  );
  const result = await getDocs(inviteQuery);
  if (result.empty) return null;
  return result.docs[0];
}

function usePresence(member) {
  useEffect(() => {
    if (!member?.uid) return;

    const presenceRef = doc(db, 'presence', member.uid);

    const markOnline = async () => {
      await setDoc(presenceRef, {
        uid: member.uid,
        email: member.email,
        displayName: member.displayName,
        online: true,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    };

    const markOffline = async () => {
      await setDoc(presenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    };

    markOnline();
    const interval = setInterval(markOnline, 30000);
    window.addEventListener('beforeunload', markOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', markOffline);
      markOffline();
    };
  }, [member?.uid]);
}

function useNotificationCounts(member) {
  const [counts, setCounts] = useState({
    inbox: 0,
    friendRequests: 0,
    friendChat: 0,
    total: 0,
  });

  useEffect(() => {
    if (!member?.uid) return;

    const unsubscribers = [];

    const privateQuery = query(collection(db, 'privateMessages'), orderBy('createdAt', 'desc'));
    unsubscribers.push(onSnapshot(privateQuery, (snapshot) => {
      const unreadInbox = snapshot.docs
        .map((item) => item.data())
        .filter((msg) => msg.toUid === member.uid && msg.read === false).length;

      setCounts((prev) => {
        const next = { ...prev, inbox: unreadInbox };
        next.total = next.inbox + next.friendRequests + next.friendChat;
        return next;
      });
    }));

    const requestsQuery = query(collection(db, 'friendRequests'), orderBy('createdAt', 'desc'));
    unsubscribers.push(onSnapshot(requestsQuery, (snapshot) => {
      const incomingRequests = snapshot.docs
        .map((item) => item.data())
        .filter((request) => request.toUid === member.uid && request.status === 'pending').length;

      setCounts((prev) => {
        const next = { ...prev, friendRequests: incomingRequests };
        next.total = next.inbox + next.friendRequests + next.friendChat;
        return next;
      });
    }));

    const chatsQuery = query(collection(db, 'friendChats'), orderBy('updatedAt', 'desc'));
    unsubscribers.push(onSnapshot(chatsQuery, (snapshot) => {
      const unreadChatThreads = snapshot.docs
        .map((item) => item.data())
        .filter((chat) => chat.participants?.includes(member.uid))
        .filter((chat) => (chat.unreadBy || []).includes(member.uid)).length;

      setCounts((prev) => {
        const next = { ...prev, friendChat: unreadChatThreads };
        next.total = next.inbox + next.friendRequests + next.friendChat;
        return next;
      });
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [member?.uid]);

  return counts;
}

async function initialiseFirestoreCollections(member) {
  const setupDoc = {
    createdAt: serverTimestamp(),
    createdBy: member.uid,
    createdByName: member.displayName,
    setupOnly: true,
    note: 'Initial setup document for Happy Little Bubbies. Safe to delete later once real records exist.',
  };

  await setDoc(doc(db, 'appSettings', 'main'), {
    appName: 'Happy Little Bubbies',
    tagline: 'Where every little bubby belongs',
    inviteOnly: true,
    createdAt: serverTimestamp(),
    createdBy: member.uid,
  }, { merge: true });

  await setDoc(doc(db, 'users', member.uid), {
    uid: member.uid,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    badges: member.badges || [],
    createdAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, 'inviteCodes', 'sample-invite'), {
    code: 'BUBBIES-SAMPLE',
    used: false,
    createdAt: serverTimestamp(),
    createdBy: member.uid,
    note: 'Sample invite code. Replace with real single-use codes before launch.',
  }, { merge: true });

  await setDoc(doc(db, 'privateMessages', 'setup-private-message'), setupDoc, { merge: true });
  await setDoc(doc(db, 'friendRequests', 'setup-friend-request'), setupDoc, { merge: true });
  await setDoc(doc(db, 'friends', 'setup-friendship'), setupDoc, { merge: true });
  await setDoc(doc(db, 'friendChats', 'setup-friend-chat'), setupDoc, { merge: true });
  await setDoc(doc(db, 'presence', member.uid), {
    uid: member.uid,
    email: member.email,
    displayName: member.displayName,
    online: true,
    lastSeen: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, 'stories', 'setup-story-request'), setupDoc, { merge: true });
  await setDoc(doc(db, 'storyRequests', 'setup-story-teller-request'), setupDoc, { merge: true });
  await setDoc(doc(db, 'swapMeet', 'setup-swap-listing'), setupDoc, { merge: true });
  await setDoc(doc(db, 'reports', 'setup-report'), setupDoc, { merge: true });
  await setDoc(doc(db, 'naughtyBabyReports', 'setup-naughty-baby-report'), setupDoc, { merge: true });
  await setDoc(doc(db, 'mentorProfiles', 'setup-mentor-profile'), setupDoc, { merge: true });
  await setDoc(doc(db, 'mentorRequests', 'setup-mentor-request'), setupDoc, { merge: true });
}

function Badge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      marginLeft: 'auto',
      background: '#f472b6',
      color: 'white',
      borderRadius: 999,
      padding: '2px 8px',
      fontSize: 12,
      fontWeight: 900,
    }}>
      {count}
    </span>
  );
}

function AuthGate({ setMember }) {
  const [mode, setMode] = useState('signIn');
  const [displayName, setDisplayName] = useState('Happy Little Bubby');
  const [email, setEmail] = useState(FIRST_HELPER_EMAIL);
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  async function register(event) {
    event.preventDefault();
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      const usersAlreadyExist = await hasAnyUsers();

      let role = 'member';
      let status = 'pendingApproval';
      let badges = ['🐣 Little Hatchling'];
      let inviteDoc = null;

      if (!usersAlreadyExist && cleanEmail === FIRST_HELPER_EMAIL) {
        role = 'admin';
        status = 'approved';
        badges = ['🧸 Helper Bubby', '☁️ Guardian of the Playroom', '🌈 Keeper of the Bubbles', '⭐ Bubble Keeper'];
      } else {
        inviteDoc = await verifyInviteCode(inviteCode);
        if (!inviteDoc) throw new Error('Invite code is invalid, already used, or not approved.');
      }

      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = credential.user;

      const profile = {
        uid: user.uid,
        email: cleanEmail,
        displayName: displayName.trim() || 'Little Bubby',
        role,
        badges,
        status,
        inviteCode: inviteCode.trim().toUpperCase() || 'FIRST-HELPER-BUBBY',
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', user.uid), profile);
      await setDoc(doc(db, 'presence', user.uid), {
        uid: user.uid,
        email: cleanEmail,
        displayName: profile.displayName,
        online: true,
        lastSeen: serverTimestamp(),
      }, { merge: true });

      if (inviteDoc) {
        await updateDoc(doc(db, 'inviteCodes', inviteDoc.id), {
          used: true,
          usedBy: user.uid,
          usedAt: serverTimestamp(),
        });
      }

      setMember(profile);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const profile = await getUserProfile(
  credential.user.uid,
  credential.user.email);
      if (!profile) throw new Error('Account exists, but no Happy Little Bubbies profile was found.');
      setMember(profile);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    }
  }

  const isRegistering = mode === 'register';

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Logo goHome={() => {}} />
        <div className="notice"><Lock size={20} /> Invite-only community</div>

        <form className="form" onSubmit={isRegistering ? register : signIn}>
          {isRegistering && (
            <>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code, leave blank only for first Helper Bubby" />
            </>
          )}

          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />

          {error && <p className="error">{error}</p>}

          <button className="primary">{isRegistering ? 'Join Happy Little Bubbies' : 'Sign in'}</button>
        </form>

        <button className="link-button" onClick={() => setMode(isRegistering ? 'signIn' : 'register')}>
          {isRegistering ? 'I already have an account' : 'Create account'}
        </button>
      </section>
    </main>
  );
}

function HomeRoom({ setRoom, member, counts }) {
  const [setupStatus, setSetupStatus] = useState('');

  const cards = [
    ['💬', 'Chat', 'Real-time messages are live.', 'chat', 0],
    ['✉️', 'Private Inbox', 'Email-style member messages are live.', 'inbox', counts.inbox],
    ['👥', 'Friends', 'Friend requests and friends list are live.', 'friends', counts.friendRequests],
    ['🧸', 'Friend Chat', 'Real-time friend-only chat threads are live.', 'friendChat', counts.friendChat],
    ['🔔', 'Notifications', 'Unread counts, friend requests, and presence.', 'notifications', counts.total],
    ['🛠️', 'Admin Console', 'Helper Bubby control room.', 'admin', 0],
  ];

  async function runSetup() {
    setSetupStatus('Creating collections...');
    try {
      await initialiseFirestoreCollections(member);
      setSetupStatus('Done. Firestore collections are ready for the next stages.');
    } catch (err) {
      setSetupStatus(err.message || 'Setup failed.');
    }
  }

  return (
    <section className="room">
      <div className="hero">
        <h2>Welcome, {member.displayName}.</h2>
        <p>Stage 11 adds Story Corner posts, comments, likes, and Helper Bubby moderation.</p>
      </div>

      {member.role === 'admin' && (
        <div className="profile" style={{ marginBottom: 20 }}>
          <h3>🧸 Helper Bubby Setup</h3>
          <p className="muted">Create Firestore collections for the next stages.</p>
          <button className="primary" onClick={runSetup}>Create Firestore collections</button>
          {setupStatus && <p className={setupStatus.startsWith('Done') ? 'success' : 'muted'}>{setupStatus}</p>}
        </div>
      )}

      <div className="cards">
        {cards.map(([emoji, title, text, target, count]) => (
          <button className="feature-card" key={title} onClick={() => setRoom(target)}>
            <span>{emoji}</span>
            <h3>{title} {count ? `(${count})` : ''}</h3>
            <p>{text}</p>
          </button>
        ))}
      </div>
    </section>
  );
}


function ProtectedImage({ src, alt = 'Shared photo', caption = 'Protected photo' }) {
  if (!src) return null;

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: 'relative',
        marginTop: 12,
        borderRadius: 22,
        overflow: 'hidden',
        background: '#f5f7fb',
        userSelect: 'none',
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: 420,
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          background: '#fff',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          background: 'rgba(15, 23, 42, 0.72)',
          color: '#fff',
          borderRadius: 999,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 900,
        }}
      >
        {caption}
      </div>
    </div>
  );
}

async function uploadChatPhoto(file, folder, uid) {
  if (!file) return null;

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${cleanExt}`;
  const storagePath = `${folder}/${uid}/${fileName}`;
  const imageRef = ref(storage, storagePath);

  await uploadBytes(imageRef, file, {
    contentType: file.type || 'image/jpeg',
  });

  const imageUrl = await getDownloadURL(imageRef);
  return { imageUrl, storagePath };
}


function ChatRoom({ member }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatError, setChatError] = useState('');
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const chatQuery = query(collection(db, 'chatMessages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      chatQuery,
      (snapshot) => {
        const loadedMessages = snapshot.docs.map((chatDoc) => ({ id: chatDoc.id, ...chatDoc.data() }));
        setMessages(loadedMessages);
        setChatError('');
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      (err) => setChatError(err.message || 'Could not load chat messages.')
    );
    return unsubscribe;
  }, []);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if ((!cleanMessage && !photoFile) || sending) return;

    setSending(true);
    setChatError('');

    try {
      let imagePayload = {};
      if (photoFile) {
        setUploadingPhoto(true);
        imagePayload = await uploadChatPhoto(photoFile, 'chatPhotos', member.uid);
      }

      await addDoc(collection(db, 'chatMessages'), {
        text: cleanMessage,
        imageUrl: imagePayload.imageUrl || '',
        imageStoragePath: imagePayload.storagePath || '',
        senderUid: member.uid,
        senderName: member.displayName,
        senderRole: member.role,
        createdAt: serverTimestamp(),
      });
      setMessage('');
      setPhotoFile(null);
    } catch (err) {
      setChatError(err.message || 'Message could not be sent.');
    } finally {
      setSending(false);
      setUploadingPhoto(false);
    }
  }

  return (
    <section className="room">
      <h2>Chat</h2>
      <p className="muted">Live community chat for invited members.</p>
      {chatError && <p className="error">{chatError}</p>}

      <div className="list" style={{ maxHeight: 460, overflowY: 'auto', marginBottom: 18 }}>
        {messages.length === 0 && (
          <div className="bubble">
            <strong>Happy Little Bubbies</strong>
            <p>No messages yet. Send the first tiny bubble into the room.</p>
          </div>
        )}

        {messages.map((chat) => {
          const mine = chat.senderUid === member.uid;
          return (
            <div
              className="bubble"
              key={chat.id}
              style={{
                marginLeft: mine ? 'auto' : 0,
                maxWidth: 760,
                border: mine ? '2px solid #f9a8d4' : '1px solid rgba(255,255,255,.9)',
              }}
            >
              <strong>{chat.senderName || 'Little Bubby'}</strong>
              {chat.senderRole === 'admin' && (
                <span style={{ marginLeft: 8, color: '#ec4899', fontWeight: 900 }}>🧸 Helper Bubby</span>
              )}
              {chat.text && <p>{chat.text}</p>}
              {chat.imageUrl && (
                <ProtectedImage
                  src={chat.imageUrl}
                  alt="Chat photo"
                  caption="Happy Little Bubbies photo"
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={sendMessage}>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a cozy message" maxLength={1000} />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          title="Add photo"
        />
        {photoFile && <span className="muted">Photo ready: {photoFile.name}</span>}
        <button type="submit" disabled={sending || uploadingPhoto}>
          <Send size={16} /> {uploadingPhoto ? 'Uploading photo...' : sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </section>
  );
}

function InboxRoom({ member }) {
  const [toEmail, setToEmail] = useState('');
  const [body, setBody] = useState('');
  const [messages, setMessages] = useState([]);
  const [inboxStatus, setInboxStatus] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const inboxQuery = query(collection(db, 'privateMessages'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      inboxQuery,
      (snapshot) => {
        const allMessages = snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }));
        const myMessages = allMessages.filter((msg) => msg.toUid === member.uid || msg.fromUid === member.uid);
        setMessages(myMessages);
        setInboxStatus('');
      },
      (err) => setInboxStatus(err.message || 'Could not load private inbox.')
    );

    return unsubscribe;
  }, [member.uid]);

  async function markMessageRead(msg) {
    if (msg.toUid === member.uid && msg.read === false) {
      await updateDoc(doc(db, 'privateMessages', msg.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    }
  }

  async function sendPrivateMessage(event) {
    event.preventDefault();
    const cleanEmail = toEmail.trim().toLowerCase();
    const cleanBody = body.trim();
    if (!cleanEmail || !cleanBody || sending) return;

    setSending(true);
    setInboxStatus('');

    try {
      const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
      const userResult = await getDocs(userQuery);

      let recipient = null;

      if (!userResult.empty) {
        recipient = userResult.docs[0].data();
      } else {
        const memberQuery = query(collection(db, 'members'), where('email', '==', cleanEmail), limit(1));
        const memberResult = await getDocs(memberQuery);
        if (!memberResult.empty) {
          const data = memberResult.docs[0].data();
          recipient = {
            uid: memberResult.docs[0].id,
            email: data.email,
            displayName: data.displayName || cleanEmail,
          };
        }
      }

      if (!recipient) throw new Error('No member found with that email address.');

      await addDoc(collection(db, 'privateMessages'), {
        fromUid: member.uid,
        fromEmail: member.email,
        fromName: member.displayName,
        toUid: recipient.uid,
        toEmail: recipient.email,
        toName: recipient.displayName || recipient.email,
        body: cleanBody,
        read: false,
        createdAt: serverTimestamp(),
      });

      setToEmail('');
      setBody('');
      setInboxStatus('Private message sent.');
    } catch (err) {
      setInboxStatus(err.message || 'Private message could not be sent.');
    } finally {
      setSending(false);
      setUploadingPhoto(false);
    }
  }

  return (
    <section className="room">
      <h2>Private Inbox</h2>
      <p className="muted">Send private messages to other approved members by email address.</p>

      <div className="profile" style={{ marginBottom: 20 }}>
        <h3>Send a private message</h3>
        <form className="form compact" onSubmit={sendPrivateMessage}>
          <input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="Recipient email address" type="email" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your private message" />
          <button type="submit" disabled={sending}>{sending ? 'Sending...' : 'Send private message'}</button>
        </form>
        {inboxStatus && <p className={inboxStatus.includes('sent') ? 'success' : 'error'}>{inboxStatus}</p>}
      </div>

      <h3>Messages</h3>
      <div className="list">
        {messages.length === 0 && (
          <div className="bubble">
            <strong>No private messages yet</strong>
            <p>Your private inbox is soft, quiet, and waiting.</p>
          </div>
        )}

        {messages.map((msg) => {
          const sentByMe = msg.fromUid === member.uid;
          return (
            <div className="bubble" key={msg.id} onClick={() => markMessageRead(msg)}>
              <strong>{sentByMe ? `To: ${msg.toName || msg.toEmail}` : `From: ${msg.fromName || msg.fromEmail}`}</strong>
              {!sentByMe && msg.read === false && <span style={{ marginLeft: 8, color: '#ec4899', fontWeight: 900 }}>NEW</span>}
              <p>{msg.body}</p>

              {msg.callUrl && (
                <div className="success" style={{ marginTop: 12 }}>
                  <strong>{msg.callType === 'audio' ? '📞 Audio call' : '🎥 Video call'}</strong>
                  <p>{msg.fromName} invited you to join a private call.</p>
                  <a
                    href={msg.callUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="primary"
                    style={{
                      display: 'inline-block',
                      padding: '10px 16px',
                      borderRadius: 999,
                      textDecoration: 'none',
                    }}
                  >
                    Join call
                  </a>
                </div>
              )}

              {msg.audioUrl && (
                <div style={{ marginTop: 12 }}>
                  <a
                    href={msg.audioUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: '#ec4899',
                      fontWeight: 900,
                      textDecoration: 'none',
                      display: 'inline-block',
                      marginBottom: 10,
                    }}
                  >
                    🎧 {msg.audioFileName || 'Open recorded story'}
                  </a>

                  <audio controls src={msg.audioUrl} style={{ width: '100%' }}>
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              <p className="muted">{sentByMe ? 'Sent' : msg.read === false ? 'Unread, click to mark read' : 'Read'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FriendsRoom({ member }) {
  const [friendEmail, setFriendEmail] = useState('');
  const [status, setStatus] = useState('');
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  useEffect(() => {
    const requestQuery = query(collection(db, 'friendRequests'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      requestQuery,
      (snapshot) => {
        const allRequests = snapshot.docs.map((requestDoc) => ({ id: requestDoc.id, ...requestDoc.data() }));
        const myRequests = allRequests.filter((request) => request.toUid === member.uid || request.fromUid === member.uid);
        setRequests(myRequests);
      },
      (err) => setStatus(err.message || 'Could not load friend requests.')
    );

    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const friendsQuery = query(collection(db, 'friends'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      friendsQuery,
      (snapshot) => {
        const allFriends = snapshot.docs.map((friendDoc) => ({ id: friendDoc.id, ...friendDoc.data() }));
        const myFriends = allFriends.filter((friend) => friend.userIds?.includes(member.uid));
        setFriends(myFriends);
      },
      (err) => setStatus(err.message || 'Could not load friends.')
    );

    return unsubscribe;
  }, [member.uid]);

  async function createMemberInvite() {
    setInviteStatus('');
    setCreatingInvite(true);

    try {
      const code = makeInviteCode();

      await addDoc(collection(db, 'inviteCodes'), {
        code,
        used: false,
        createdAt: serverTimestamp(),
        createdBy: member.uid,
        createdByName: member.displayName,
        createdByEmail: member.email,
        createdByRole: member?.role || "member",
        source: 'member-invite',
      });

      setInviteCode(code);
      setInviteStatus('Invite code created. Share it with someone you trust.');
    } catch (err) {
      setInviteStatus(err.message || 'Could not create invite code.');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInvite() {
    if (!inviteCode) return;

    const inviteText = `Join Happy Little Bubbies with invite code: ${inviteCode}`;

    try {
      await navigator.clipboard.writeText(inviteText);
      setInviteStatus('Invite copied to clipboard.');
    } catch {
      setInviteStatus(`Copy this invite code: ${inviteCode}`);
    }
  }

  async function sendFriendRequest(event) {
    event.preventDefault();
    setStatus('');

    const cleanEmail = friendEmail.trim().toLowerCase();
    if (!cleanEmail) return;

    try {
      if (cleanEmail === member.email) throw new Error('You cannot friend-request yourself.');

      const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
      const userResult = await getDocs(userQuery);
      if (userResult.empty) throw new Error('No member found with that email address.');

      const recipient = userResult.docs[0].data();

      const duplicateQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', member.uid),
        where('toUid', '==', recipient.uid),
        where('status', '==', 'pending'),
        limit(1)
      );
      const duplicateResult = await getDocs(duplicateQuery);
      if (!duplicateResult.empty) throw new Error('Friend request already sent.');

      await addDoc(collection(db, 'friendRequests'), {
        fromUid: member.uid,
        fromEmail: member.email,
        fromName: member.displayName,
        toUid: recipient.uid,
        toEmail: recipient.email,
        toName: recipient.displayName || recipient.email,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setFriendEmail('');
      setStatus('Friend request sent.');
    } catch (err) {
      setStatus(err.message || 'Friend request failed.');
    }
  }

  async function acceptFriendRequest(request) {
    try {
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'friends'), {
        userIds: [request.fromUid, request.toUid],
        users: [
          { uid: request.fromUid, email: request.fromEmail, displayName: request.fromName },
          { uid: request.toUid, email: request.toEmail, displayName: request.toName },
        ],
        createdAt: serverTimestamp(),
      });

      setStatus('Friend request accepted.');
    } catch (err) {
      setStatus(err.message || 'Could not accept request.');
    }
  }

  async function declineFriendRequest(request) {
    try {
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'declined',
        declinedAt: serverTimestamp(),
      });
      setStatus('Friend request declined.');
    } catch (err) {
      setStatus(err.message || 'Could not decline request.');
    }
  }

  const incoming = requests.filter((request) => request.toUid === member.uid && request.status === 'pending');
  const outgoing = requests.filter((request) => request.fromUid === member.uid && request.status === 'pending');

  return (
    <section className="room">
      <h2>Friends</h2>
      <p className="muted">Send, accept, and manage friend requests.</p>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          marginBottom: 24,
          minHeight: 220,
          boxShadow: '0 18px 45px rgba(0,0,0,0.14)',
          background: '#f5f7fb',
        }}
      >
        <img
          src="/friends-icon.png"
          alt="Friends banner"
          style={{
            width: '100%',
            height: 260,
            objectFit: 'cover',
            display: 'block',
          }}
          draggable={false}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62))',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 24,
          }}
        >
          <div>
            <h1
              style={{
                color: '#ffffff',
                margin: 0,
                fontSize: 38,
                textShadow: '0 2px 10px rgba(0,0,0,0.35)',
              }}
            >
              Friends
            </h1>
            <p
              style={{
                color: '#ffffff',
                marginTop: 8,
                marginBottom: 0,
                fontWeight: 800,
                textShadow: '0 2px 10px rgba(0,0,0,0.35)',
              }}
            >
              Your Little Bubbies family, all in one sunny backyard.
            </p>
          </div>
        </div>
      </div>

      <div className="profile" style={{ marginBottom: 20 }}>
        <h3>🎟️ Invite a Bubby</h3>
        <p className="muted">Any member can create an invite code for someone they trust.</p>

        <button className="primary" onClick={createMemberInvite} disabled={creatingInvite}>
          {creatingInvite ? 'Creating invite...' : 'Create invite code'}
        </button>

        {inviteCode && (
          <div className="bubble" style={{ marginTop: 14 }}>
            <strong>Invite code</strong>
            <p
              style={{
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: 1,
              }}
            >
              {inviteCode}
            </p>
            <button className="link-button" onClick={copyInvite}>Copy invite</button>
          </div>
        )}

        {inviteStatus && <p className={inviteStatus.includes('created') || inviteStatus.includes('copied') ? 'success' : 'error'}>{inviteStatus}</p>}
      </div>

      <div className="profile" style={{ marginBottom: 20 }}>
        <h3>Send friend request</h3>
        <form className="form compact" onSubmit={sendFriendRequest}>
          <input value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} placeholder="Friend email address" type="email" />
          <button type="submit">Send friend request</button>
        </form>
        {status && <p className={status.includes('sent') || status.includes('accepted') || status.includes('declined') ? 'success' : 'error'}>{status}</p>}
      </div>

      <div className="cards">
        <div className="feature-card">
          <span>📥</span>
          <h3>Incoming Requests</h3>
          {incoming.length === 0 && <p>No incoming requests.</p>}
          {incoming.map((request) => (
            <div className="bubble" key={request.id}>
              <strong>{request.fromName}</strong>
              <p>{request.fromEmail}</p>
              <button className="primary" onClick={() => acceptFriendRequest(request)}>Accept</button>
              <button className="link-button" onClick={() => declineFriendRequest(request)}>Decline</button>
            </div>
          ))}
        </div>

        <div className="feature-card">
          <span>📤</span>
          <h3>Sent Requests</h3>
          {outgoing.length === 0 && <p>No sent requests waiting.</p>}
          {outgoing.map((request) => (
            <div className="bubble" key={request.id}>
              <strong>{request.toName}</strong>
              <p>{request.toEmail}</p>
              <p className="muted">Pending</p>
            </div>
          ))}
        </div>

        <div className="feature-card">
          <img
            src="/friends-icon.png"
            alt="Friends"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              objectFit: 'cover',
              boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
            }}
            draggable={false}
          />
          <h3>Friends List</h3>
          {friends.length === 0 && <p>No friends yet.</p>}
          {friends.map((friend) => {
            const other = friend.users?.find((item) => item.uid !== member.uid);
            return <PresenceCard key={friend.id} person={other} />;
          })}
        </div>
      </div>
    </section>
  );
}

function PresenceCard({ person }) {
  const [presence, setPresence] = useState(null);

  useEffect(() => {
    if (!person?.uid) return;
    const unsubscribe = onSnapshot(doc(db, 'presence', person.uid), (snapshot) => {
      setPresence(snapshot.exists() ? snapshot.data() : null);
    });
    return unsubscribe;
  }, [person?.uid]);

  return (
    <div className="bubble">
      <strong>{person?.displayName || 'Friend'}</strong>
      <p>{person?.email}</p>
      <p className="muted">
        {presence?.online ? '🟢 Online' : `⚪ Offline, last seen ${formatDate(presence?.lastSeen)}`}
      </p>
    </div>
  );
}

function FriendChatRoom({ member }) {
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [selectedPresence, setSelectedPresence] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const friendsQuery = query(collection(db, 'friends'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      friendsQuery,
      (snapshot) => {
        const allFriends = snapshot.docs.map((friendDoc) => ({ id: friendDoc.id, ...friendDoc.data() }));
        const myFriends = allFriends
          .filter((friend) => friend.userIds?.includes(member.uid))
          .map((friend) => {
            const other = friend.users?.find((item) => item.uid !== member.uid);
            return {
              friendshipId: friend.id,
              chatId: chatIdFor(member.uid, other?.uid || ''),
              uid: other?.uid,
              email: other?.email,
              displayName: other?.displayName || other?.email || 'Friend',
            };
          })
          .filter((friend) => friend.uid);

        setFriends(myFriends);
        if (!selectedFriend && myFriends.length > 0) setSelectedFriend(myFriends[0]);
      },
      (err) => setStatus(err.message || 'Could not load friends.')
    );

    return unsubscribe;
  }, [member.uid, selectedFriend]);

  useEffect(() => {
    if (!selectedFriend?.uid) {
      setSelectedPresence(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'presence', selectedFriend.uid), (snapshot) => {
      setSelectedPresence(snapshot.exists() ? snapshot.data() : null);
    });
    return unsubscribe;
  }, [selectedFriend?.uid]);

  useEffect(() => {
    if (!selectedFriend) {
      setThreadMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, 'friendChats', selectedFriend.chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messages = snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }));
        setThreadMessages(messages);
        setStatus('');
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      (err) => setStatus(err.message || 'Could not load friend chat.')
    );

    return unsubscribe;
  }, [selectedFriend]);

  useEffect(() => {
    if (!selectedFriend) return;

    const unsubscribe = onSnapshot(doc(db, 'friendChats', selectedFriend.chatId), async (snapshot) => {
      if (!snapshot.exists()) return;
      const chat = snapshot.data();
      const typingBy = chat.typingBy || {};
      setOtherTyping(Boolean(typingBy[selectedFriend.uid]));

      if ((chat.unreadBy || []).includes(member.uid)) {
        await updateDoc(doc(db, 'friendChats', selectedFriend.chatId), {
          unreadBy: (chat.unreadBy || []).filter((uid) => uid !== member.uid),
        });
      }
    });

    return unsubscribe;
  }, [selectedFriend, member.uid]);

  async function updateTyping(value) {
    if (!selectedFriend) return;

    await setDoc(doc(db, 'friendChats', selectedFriend.chatId), {
      typingBy: {
        [member.uid]: value,
      },
      updatedAt: serverTimestamp(),
      participants: [member.uid, selectedFriend.uid],
      participantEmails: [member.email, selectedFriend.email],
      participantNames: [member.displayName, selectedFriend.displayName],
    }, { merge: true });
  }

  function handleTyping(value) {
    setMessage(value);
    updateTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => updateTyping(false), 1200);
  }

  async function startPrivateCall(callType) {
    if (!selectedFriend || sending) return;

    setSending(true);
    setStatus('');

    try {
      const roomId = makeCallRoomId(member.uid, selectedFriend.uid);
      const callUrl = callUrlFor(roomId, callType);
      const label = callType === 'audio' ? 'Audio call' : 'Video call';
      const chatDocRef = doc(db, 'friendChats', selectedFriend.chatId);

      await setDoc(chatDocRef, {
        chatId: selectedFriend.chatId,
        participants: [member.uid, selectedFriend.uid],
        participantEmails: [member.email, selectedFriend.email],
        participantNames: [member.displayName, selectedFriend.displayName],
        updatedAt: serverTimestamp(),
        lastMessage: `${label} invitation`,
        lastMessageFrom: member.uid,
        unreadBy: [selectedFriend.uid],
        typingBy: {
          [member.uid]: false,
        },
      }, { merge: true });

      await addDoc(collection(db, 'friendChats', selectedFriend.chatId, 'messages'), {
        text: `${label} invitation`,
        callType,
        callUrl,
        callRoomId: roomId,
        senderUid: member.uid,
        senderName: member.displayName,
        recipientUid: selectedFriend.uid,
        recipientName: selectedFriend.displayName,
        createdAt: serverTimestamp(),
        read: false,
      });

      await addDoc(collection(db, 'privateMessages'), {
        fromUid: member.uid,
        fromEmail: member.email,
        fromName: member.displayName,
        toUid: selectedFriend.uid,
        toEmail: selectedFriend.email,
        toName: selectedFriend.displayName,
        body: `${member.displayName} started a ${callType} call with you.`,
        callType,
        callUrl,
        callRoomId: roomId,
        read: false,
        createdAt: serverTimestamp(),
      });

      window.open(callUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setStatus(err.message || 'Could not start call.');
    } finally {
      setSending(false);
    }
  }

  async function sendFriendChatMessage(event) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!selectedFriend || (!cleanMessage && !photoFile) || sending) return;

    setSending(true);
    setStatus('');

    try {
      let imagePayload = {};
      if (photoFile) {
        setUploadingPhoto(true);
        imagePayload = await uploadChatPhoto(photoFile, `friendChatPhotos/${selectedFriend.chatId}`, member.uid);
      }

      const chatDocRef = doc(db, 'friendChats', selectedFriend.chatId);

      await setDoc(chatDocRef, {
        chatId: selectedFriend.chatId,
        participants: [member.uid, selectedFriend.uid],
        participantEmails: [member.email, selectedFriend.email],
        participantNames: [member.displayName, selectedFriend.displayName],
        updatedAt: serverTimestamp(),
        lastMessage: cleanMessage || '📷 Photo',
        lastMessageFrom: member.uid,
        unreadBy: [selectedFriend.uid],
        typingBy: {
          [member.uid]: false,
        },
      }, { merge: true });

      await addDoc(collection(db, 'friendChats', selectedFriend.chatId, 'messages'), {
        text: cleanMessage,
        imageUrl: imagePayload.imageUrl || '',
        imageStoragePath: imagePayload.storagePath || '',
        senderUid: member.uid,
        senderName: member.displayName,
        recipientUid: selectedFriend.uid,
        recipientName: selectedFriend.displayName,
        createdAt: serverTimestamp(),
        read: false,
      });

      setMessage('');
      setPhotoFile(null);
      updateTyping(false);
    } catch (err) {
      setStatus(err.message || 'Could not send friend chat message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="room">
      <h2>Friend Chat</h2>
      <p className="muted">Real-time chat threads for accepted friends only.</p>
      {status && <p className="error">{status}</p>}

      {friends.length === 0 ? (
        <div className="bubble">
          <strong>No friends yet</strong>
          <p>Accept a friend request before starting a friend chat.</p>
        </div>
      ) : (
        <div className="cards">
          <div className="feature-card">
            <span>🧸</span>
            <h3>Friends</h3>
            {friends.map((friend) => (
              <FriendButton
                key={friend.uid}
                friend={friend}
                selected={selectedFriend?.uid === friend.uid}
                onClick={() => setSelectedFriend(friend)}
              />
            ))}
          </div>

          <div className="feature-card" style={{ gridColumn: 'span 2' }}>
            <span>💬</span>
            <h3>{selectedFriend ? `Chat with ${selectedFriend.displayName}` : 'Pick a friend'}</h3>
            {selectedFriend && (
              <p className="muted">
                {selectedPresence?.online ? '🟢 Online now' : `⚪ Offline, last seen ${formatDate(selectedPresence?.lastSeen)}`}
              </p>
            )}
            {otherTyping && <p className="success">{selectedFriend.displayName} is typing...</p>}

            {selectedFriend && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => startPrivateCall('video')}
                  disabled={sending}
                >
                  🎥 Start video call
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => startPrivateCall('audio')}
                  disabled={sending}
                >
                  📞 Start audio call
                </button>
              </div>
            )}

            <div className="list" style={{ maxHeight: 420, overflowY: 'auto', marginBottom: 18 }}>
              {threadMessages.length === 0 && (
                <div className="bubble">
                  <strong>No messages yet</strong>
                  <p>Send the first friend-chat bubble.</p>
                </div>
              )}

              {threadMessages.map((chat) => {
                const mine = chat.senderUid === member.uid;
                return (
                  <div
                    className="bubble"
                    key={chat.id}
                    style={{
                      marginLeft: mine ? 'auto' : 0,
                      maxWidth: 620,
                      border: mine ? '2px solid #f9a8d4' : '1px solid rgba(255,255,255,.9)',
                    }}
                  >
                    <strong>{chat.senderName}</strong>
                    {chat.text && <p>{chat.text}</p>}
                    {chat.imageUrl && (
                      <ProtectedImage
                        src={chat.imageUrl}
                        alt="Friend chat photo"
                        caption="Friend chat photo"
                      />
                    )}
                    {chat.callUrl && (
                      <div className="success" style={{ marginTop: 12 }}>
                        <strong>{chat.callType === 'audio' ? '📞 Audio call' : '🎥 Video call'}</strong>
                        <p>{chat.senderName} invited you to join a private call.</p>
                        <a
                          href={chat.callUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="primary"
                          style={{
                            display: 'inline-block',
                            padding: '10px 16px',
                            borderRadius: 999,
                            textDecoration: 'none',
                          }}
                        >
                          Join call
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendFriendChatMessage}>
              <input
                value={message}
                onChange={(e) => handleTyping(e.target.value)}
                placeholder={selectedFriend ? `Message ${selectedFriend.displayName}` : 'Pick a friend first'}
                maxLength={1000}
                disabled={!selectedFriend}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                disabled={!selectedFriend}
                title="Add photo"
              />
              {photoFile && <span className="muted">Photo ready: {photoFile.name}</span>}
              <button type="submit" disabled={sending || uploadingPhoto || !selectedFriend}>
                <Send size={16} /> {uploadingPhoto ? 'Uploading photo...' : sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function FriendButton({ friend, selected, onClick }) {
  const [presence, setPresence] = useState(null);
  const [chat, setChat] = useState(null);

  useEffect(() => {
    if (!friend.uid) return;
    const unsubscribe = onSnapshot(doc(db, 'presence', friend.uid), (snapshot) => {
      setPresence(snapshot.exists() ? snapshot.data() : null);
    });
    return unsubscribe;
  }, [friend.uid]);

  useEffect(() => {
    if (!friend.chatId) return;
    const unsubscribe = onSnapshot(doc(db, 'friendChats', friend.chatId), (snapshot) => {
      setChat(snapshot.exists() ? snapshot.data() : null);
    });
    return unsubscribe;
  }, [friend.chatId]);

  const unread = chat?.unreadBy?.includes(auth.currentUser?.uid);

  return (
    <button
      className={selected ? 'primary' : 'link-button'}
      onClick={onClick}
      style={{ width: '100%', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <span>{presence?.online ? '🟢' : '⚪'} {friend.displayName}</span>
      {unread && <span>NEW</span>}
    </button>
  );
}

function NotificationsRoom({ member, counts }) {
  const [requests, setRequests] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState([]);
  const [unreadChats, setUnreadChats] = useState([]);

  useEffect(() => {
    const requestsQuery = query(collection(db, 'friendRequests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const incoming = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((request) => request.toUid === member.uid && request.status === 'pending');
      setRequests(incoming);
    });
    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const privateQuery = query(collection(db, 'privateMessages'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(privateQuery, (snapshot) => {
      const unread = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((msg) => msg.toUid === member.uid && msg.read === false);
      setUnreadMessages(unread);
    });
    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const chatsQuery = query(collection(db, 'friendChats'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
      const unread = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((chat) => chat.participants?.includes(member.uid))
        .filter((chat) => (chat.unreadBy || []).includes(member.uid));
      setUnreadChats(unread);
    });
    return unsubscribe;
  }, [member.uid]);

  return (
    <section className="room">
      <h2>Notifications</h2>
      <p className="muted">Your unread bubbles, friend requests, and chat nudges.</p>

      <div className="cards">
        <div className="feature-card">
          <span>✉️</span>
          <h3>Private Inbox ({counts.inbox})</h3>
          {unreadMessages.length === 0 && <p>No unread private messages.</p>}
          {unreadMessages.map((msg) => (
            <div className="bubble" key={msg.id}>
              <strong>From: {msg.fromName}</strong>
              <p>{msg.body}</p>
            </div>
          ))}
        </div>

        <div className="feature-card">
          <span>👥</span>
          <h3>Friend Requests ({counts.friendRequests})</h3>
          {requests.length === 0 && <p>No new friend requests.</p>}
          {requests.map((request) => (
            <div className="bubble" key={request.id}>
              <strong>{request.fromName}</strong>
              <p>{request.fromEmail}</p>
            </div>
          ))}
        </div>

        <div className="feature-card">
          <span>💬</span>
          <h3>Friend Chats ({counts.friendChat})</h3>
          {unreadChats.length === 0 && <p>No unread friend chats.</p>}
          {unreadChats.map((chat) => (
            <div className="bubble" key={chat.chatId}>
              <strong>New friend chat</strong>
              <p>{chat.lastMessage}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}








function StoryRecorder({ request, onUpload, uploading }) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [recorderStatus, setRecorderStatus] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    setRecorderStatus('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecorderStatus('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
        setRecorderStatus('Recording ready. Preview it, then upload when happy.');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setRecorderStatus('Recording...');
    } catch (err) {
      setRecorderStatus(err.message || 'Could not access microphone.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  function clearRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setRecorderStatus('');
  }

  async function uploadRecording() {
    if (!audioBlob) {
      setRecorderStatus('Record a story first.');
      return;
    }

    const fileNameBase = request.dialogueName || request.requesterName || 'Happy Little Bubby';
    const file = new File([audioBlob], `${fileNameBase} story.webm`, {
      type: audioBlob.type || 'audio/webm',
    });

    await onUpload(request, file);
    clearRecording();
  }

  return (
    <div
      style={{
        marginTop: 14,
        background: '#f5f7fb',
        borderRadius: 22,
        padding: 16,
      }}
    >
      <h3 style={{ marginTop: 0 }}>🎙️ Record in app</h3>
      <p className="muted">Use your microphone to record the story here, then upload it when ready.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {!recording ? (
          <button type="button" className="primary" onClick={startRecording} disabled={uploading}>
            Start recording
          </button>
        ) : (
          <button type="button" className="primary" onClick={stopRecording}>
            Stop recording
          </button>
        )}

        {audioBlob && (
          <>
            <button type="button" className="primary" onClick={uploadRecording} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload recorded story'}
            </button>
            <button type="button" className="link-button" onClick={clearRecording} disabled={uploading}>
              Re-record
            </button>
          </>
        )}
      </div>

      {audioUrl && (
        <audio controls src={audioUrl} style={{ width: '100%', marginTop: 10 }}>
          Your browser does not support audio playback.
        </audio>
      )}

      {recorderStatus && (
        <p className={recorderStatus.includes('ready') ? 'success' : recorderStatus.includes('Recording') ? 'muted' : 'error'}>
          {recorderStatus}
        </p>
      )}
    </div>
  );
}


function StoryCornerRoom({ member }) {
  const [storySection, setStorySection] = useState('myStories');
  const [storyText, setStoryText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [stories, setStories] = useState([]);
  const [storyRequests, setStoryRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [readerPreference, setReaderPreference] = useState('I don’t mind');
  const [dialogueName, setDialogueName] = useState('');
  const [requestedStory, setRequestedStory] = useState('');
  const [privateRequest, setPrivateRequest] = useState(false);
  const [chosenFriendUid, setChosenFriendUid] = useState('');
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [uploadingRequestId, setUploadingRequestId] = useState('');
  const [status, setStatus] = useState('');
  const [posting, setPosting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  function safeFileName(name) {
    return String(name || 'Happy Little Bubby')
      .replace(/[^a-z0-9 ]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function audioExtension(file) {
    const nameParts = file.name.split('.');
    return nameParts.length > 1 ? nameParts.pop().toLowerCase() : 'webm';
  }

  useEffect(() => {
    const storiesQuery = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      storiesQuery,
      (snapshot) => {
        const loadedStories = snapshot.docs
          .map((storyDoc) => ({ id: storyDoc.id, ...storyDoc.data() }))
          .filter((story) => !story.setupOnly && story.deleted !== true);
        setStories(loadedStories);
      },
      (err) => setStatus(err.message || 'Could not load stories.')
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const requestsQuery = query(collection(db, 'storyRequests'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const loadedRequests = snapshot.docs
          .map((requestDoc) => ({ id: requestDoc.id, ...requestDoc.data() }))
          .filter((request) => !request.setupOnly && request.deleted !== true);
        setStoryRequests(loadedRequests);
      },
      (err) => setStatus(err.message || 'Could not load story requests.')
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const friendsQuery = query(collection(db, 'friends'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      friendsQuery,
      (snapshot) => {
        const myFriends = snapshot.docs
          .map((friendDoc) => ({ id: friendDoc.id, ...friendDoc.data() }))
          .filter((friend) => friend.userIds?.includes(member.uid))
          .map((friend) => friend.users?.find((person) => person.uid !== member.uid))
          .filter(Boolean);

        setFriends(myFriends);
      },
      (err) => setStatus(err.message || 'Could not load friends.')
    );

    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const unsubscribers = stories.map((story) => {
      const commentsQuery = query(
        collection(db, 'stories', story.id, 'comments'),
        orderBy('createdAt', 'asc')
      );

      return onSnapshot(commentsQuery, (snapshot) => {
        const loadedComments = snapshot.docs
          .map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() }))
          .filter((comment) => comment.deleted !== true);

        setComments((current) => ({
          ...current,
          [story.id]: loadedComments,
        }));
      });
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [stories]);

  async function createStory(event) {
    event.preventDefault();

    const cleanText = storyText.trim();
    const cleanImageUrl = imageUrl.trim();

    if (!cleanText && !cleanImageUrl) {
      setStatus('Write a story or add an image URL first.');
      return;
    }

    setPosting(true);
    setStatus('');

    try {
      await addDoc(collection(db, 'stories'), {
        authorUid: member.uid,
        authorName: member.displayName,
        authorEmail: member.email,
        text: cleanText,
        imageUrl: cleanImageUrl,
        likes: [],
        pinned: false,
        deleted: false,
        createdAt: serverTimestamp(),
      });

      setStoryText('');
      setImageUrl('');
      setStatus('Story post created.');
    } catch (err) {
      setStatus(err.message || 'Could not post story.');
    } finally {
      setPosting(false);
    }
  }

  async function requestStoryTeller(event) {
    event.preventDefault();

    const cleanStory = requestedStory.trim();
    const cleanDialogueName = dialogueName.trim();
    const chosenFriend = friends.find((friend) => friend.uid === chosenFriendUid);

    if (!cleanStory) {
      setStatus('Please enter the story you would like read.');
      return;
    }

    if (privateRequest && !chosenFriend) {
      setStatus('For a private request, choose the friend you want to read it.');
      return;
    }

    setRequesting(true);
    setStatus('');

    try {
      await addDoc(collection(db, 'storyRequests'), {
        requesterUid: member.uid,
        requesterName: member.displayName,
        requesterEmail: member.email,
        readerPreference,
        dialogueName: cleanDialogueName,
        requestedStory: cleanStory,
        privateRequest,
        chosenReaderUid: privateRequest ? chosenFriend.uid : '',
        chosenReaderName: privateRequest ? chosenFriend.displayName : '',
        chosenReaderEmail: privateRequest ? chosenFriend.email : '',
        status: 'open',
        deleted: false,
        createdAt: serverTimestamp(),
      });

      setReaderPreference('I don’t mind');
      setDialogueName('');
      setRequestedStory('');
      setPrivateRequest(false);
      setChosenFriendUid('');
      setStatus('Story teller request submitted.');
      setStorySection('myStories');
    } catch (err) {
      setStatus(err.message || 'Could not submit story teller request.');
    } finally {
      setRequesting(false);
    }
  }

  async function acceptStoryRequest(request) {
    if (request.status !== 'open') {
      setStatus('This story request has already been accepted.');
      return;
    }

    if (request.privateRequest && request.chosenReaderUid && request.chosenReaderUid !== member.uid) {
      setStatus('This private story request is for a chosen friend only.');
      return;
    }

    await updateDoc(doc(db, 'storyRequests', request.id), {
      status: 'accepted',
      acceptedByUid: member.uid,
      acceptedByName: member.displayName,
      acceptedByEmail: member.email,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
    });

    setStatus('Story request accepted. The story text is now visible to you.');
  }

  async function updateStoryRequestStatus(request, nextStatus) {
    const canManage =
      request.acceptedByUid === member.uid ||
      request.requesterUid === member.uid ||
      (!request.privateRequest && member.role === 'admin');

    if (!canManage) {
      setStatus('Only the accepter, requester, or a Helper Bubby admin can manage this story request.');
      return;
    }

    await updateDoc(doc(db, 'storyRequests', request.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
    });

    setStatus(`Story request marked ${nextStatus}.`);
  }

  async function uploadRecordedStory(request, file) {
    const canUpload =
      request.acceptedByUid === member.uid ||
      (!request.privateRequest && member.role === 'admin');

    if (!canUpload) {
      setStatus('Only the person who accepted this request can upload the recording.');
      return;
    }

    if (!file) return;

    if (request.status !== 'accepted' && request.status !== 'ready' && request.status !== 'completed') {
      setStatus('Accept the story request before uploading the recording.');
      return;
    }

    setUploadingRequestId(request.id);
    setStatus('');

    try {
      const nameForFile = safeFileName(request.dialogueName || request.requesterName || 'Happy Little Bubby');
      const fileName = `${nameForFile} story.${audioExtension(file)}`;
      const storagePath = `storyRecordings/${request.id}/${fileName}`;
      const audioRef = ref(storage, storagePath);

      await uploadBytes(audioRef, file, {
        contentType: file.type || 'audio/webm',
      });

      const audioUrl = await getDownloadURL(audioRef);

      await updateDoc(doc(db, 'storyRequests', request.id), {
        status: 'ready',
        audioUrl,
        audioFileName: fileName,
        storagePath,
        recordedByUid: member.uid,
        recordedByName: member.displayName,
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'privateMessages'), {
        fromUid: member.uid,
        fromEmail: member.email,
        fromName: member.displayName,
        toUid: request.requesterUid,
        toEmail: request.requesterEmail,
        toName: request.requesterName,
        body: `Your story is ready: ${fileName}`,
        storyRequestId: request.id,
        audioUrl,
        audioFileName: fileName,
        read: false,
        createdAt: serverTimestamp(),
      });

      setStatus(`Recorded story uploaded and ${request.requesterName} has been notified.`);
    } catch (err) {
      setStatus(err.message || 'Could not upload recorded story.');
    } finally {
      setUploadingRequestId('');
    }
  }

  async function deleteStoryRequest(request) {
    if (request.requesterUid !== member.uid && (!request.privateRequest && member.role !== 'admin')) {
      setStatus('Only the requester can delete this private request.');
      return;
    }

    await updateDoc(doc(db, 'storyRequests', request.id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: member.uid,
    });

    setStatus('Story request removed.');
  }

  async function toggleLike(story) {
    const likes = story.likes || [];
    const alreadyLiked = likes.includes(member.uid);
    const nextLikes = alreadyLiked
      ? likes.filter((uid) => uid !== member.uid)
      : [...likes, member.uid];

    await updateDoc(doc(db, 'stories', story.id), {
      likes: nextLikes,
    });
  }

  async function addComment(event, story) {
    event.preventDefault();

    const text = (commentDrafts[story.id] || '').trim();
    if (!text) return;

    await addDoc(collection(db, 'stories', story.id, 'comments'), {
      storyId: story.id,
      authorUid: member.uid,
      authorName: member.displayName,
      text,
      deleted: false,
      createdAt: serverTimestamp(),
    });

    setCommentDrafts((current) => ({
      ...current,
      [story.id]: '',
    }));
  }

  async function deleteStory(story) {
    if (story.authorUid !== member.uid && member.role !== 'admin') {
      setStatus('Only the author or a Helper Bubby admin can delete this story.');
      return;
    }

    await updateDoc(doc(db, 'stories', story.id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: member.uid,
    });

    setStatus('Story post removed.');
  }

  async function togglePin(story) {
    if (member.role !== 'admin') {
      setStatus('Only Helper Bubby admins can pin stories.');
      return;
    }

    await updateDoc(doc(db, 'stories', story.id), {
      pinned: !story.pinned,
      pinnedAt: !story.pinned ? serverTimestamp() : null,
      pinnedBy: !story.pinned ? member.uid : null,
    });

    setStatus(story.pinned ? 'Story post unpinned.' : 'Story post pinned.');
  }

  const visibleRequests = storyRequests.filter((request) => {
    if (!request.privateRequest) return true;
    if (request.requesterUid === member.uid) return true;
    if (request.chosenReaderUid === member.uid) return true;
    if (request.acceptedByUid === member.uid) return true;
    return false;
  });

  const myStories = storyRequests.filter((request) =>
    request.requesterUid === member.uid &&
    request.audioUrl &&
    (request.status === 'ready' || request.status === 'completed')
  );

  const readForBubbyRequests = visibleRequests.filter((request) => {
    if (request.status !== 'open' && request.acceptedByUid !== member.uid) return false;
    if (request.requesterUid === member.uid) return false;
    if (request.privateRequest) return request.chosenReaderUid === member.uid || request.acceptedByUid === member.uid;
    return true;
  });

  const myActiveRequests = visibleRequests.filter((request) =>
    request.requesterUid === member.uid &&
    !request.audioUrl &&
    request.status !== 'completed'
  );

  const publicLibrary = storyRequests.filter((request) =>
    !request.privateRequest &&
    request.audioUrl &&
    (request.status === 'ready' || request.status === 'completed')
  );

  const sortedStories = [...stories].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  function StoryRequestCard({ request, mode = 'request' }) {
    const acceptedByMe = request.acceptedByUid === member.uid;
    const isRequester = request.requesterUid === member.uid;
    const chosenForMe = request.chosenReaderUid === member.uid;
    const canSeeStory =
      (request.status === 'accepted' || request.status === 'ready') &&
      (acceptedByMe || isRequester || chosenForMe || (!request.privateRequest && member.role === 'admin'));
    const canUpload = acceptedByMe || (!request.privateRequest && member.role === 'admin');
    const isOpen = request.status === 'open';
    const canAccept =
      isOpen &&
      !isRequester &&
      (!request.privateRequest || request.chosenReaderUid === member.uid);

    return (
      <div className="bubble" key={request.id}>
        <strong>{request.requesterName || 'Little Bubby'}</strong>
        {request.privateRequest && <p className="success">🔒 Private request</p>}
        {request.privateRequest && request.chosenReaderName && (
          <p className="success">Chosen reader: {request.chosenReaderName}</p>
        )}
        <p className="muted">Preferred reader: {request.readerPreference || 'I don’t mind'}</p>
        {request.dialogueName && <p><strong>Name for dialogue:</strong> {request.dialogueName}</p>}
        <p className="muted">Status: {request.status || 'open'} | Requested: {formatDate(request.createdAt)}</p>

        {request.status === 'completed' ? (
          <p className="success">🎧 Story completed and delivered</p>
        ) : !canSeeStory ? (
          <p className="muted">🔒 Story text hidden until you accept this request.</p>
        ) : (
          <p style={{ whiteSpace: 'pre-wrap' }}>{request.requestedStory}</p>
        )}

        {request.acceptedByName && (
          <p className="success">Accepted by: {request.acceptedByName}</p>
        )}

        {request.audioUrl && (
          <div style={{ marginTop: 14 }}>
            <p className="success">🎧 Story ready: {request.audioFileName}</p>
            <audio controls src={request.audioUrl} style={{ width: '100%' }}>
              Your browser does not support audio playback.
            </audio>
            <p><a href={request.audioUrl} target="_blank" rel="noreferrer">Open recording</a></p>
          </div>
        )}

        {canAccept && mode !== 'library' && (
          <button className="primary" onClick={() => acceptStoryRequest(request)}>Accept and reveal story</button>
        )}

        {!isOpen && canUpload && mode !== 'library' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="link-button" onClick={() => updateStoryRequestStatus(request, 'completed')}>Completed</button>
            <button className="link-button" onClick={() => updateStoryRequestStatus(request, 'declined')}>Decline</button>
          </div>
        )}

        {canUpload && mode !== 'library' && (request.status === 'accepted' || request.status === 'ready' || request.status === 'completed') && (
          <div style={{ marginTop: 14 }}>
            <StoryRecorder
              request={request}
              onUpload={uploadRecordedStory}
              uploading={uploadingRequestId === request.id}
            />

            <div
              style={{
                marginTop: 14,
                background: '#f5f7fb',
                borderRadius: 22,
                padding: 16,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Upload existing recording</h3>
              <p className="muted">Already recorded on your device? Upload the audio here. The file will be saved as: {(request.dialogueName || request.requesterName || 'Happy Little Bubby')} story</p>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => uploadRecordedStory(request, e.target.files?.[0])}
              />
              {uploadingRequestId === request.id && <p className="muted">Uploading recording...</p>}
            </div>
          </div>
        )}

        {(request.requesterUid === member.uid || (!request.privateRequest && member.role === 'admin')) && mode !== 'library' && (
          <button className="link-button" onClick={() => deleteStoryRequest(request)}>Delete request</button>
        )}
      </div>
    );
  }

  function renderStoryPosts() {
    return (
      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Community Story Posts</h3>
        <p className="muted">Short written posts and updates from members.</p>

        <form className="form compact" onSubmit={createStory}>
          <textarea
            value={storyText}
            onChange={(e) => setStoryText(e.target.value)}
            placeholder="What would you like to share?"
            maxLength={2000}
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Optional image URL"
          />
          <button type="submit" disabled={posting}>{posting ? 'Posting...' : 'Post story'}</button>
        </form>

        {sortedStories.length === 0 && (
          <div className="bubble">
            <strong>No story posts yet</strong>
            <p>Be the first to place a tiny lantern in Story Corner.</p>
          </div>
        )}

        {sortedStories.map((story) => {
          const likes = story.likes || [];
          const liked = likes.includes(member.uid);
          const storyComments = comments[story.id] || [];

          return (
            <article className="bubble" key={story.id} style={{ marginBottom: 20 }}>
              {story.pinned && <p className="success">📌 Pinned by Helper Bubby</p>}
              <strong>{story.authorName || 'Little Bubby'}</strong>
              <p className="muted">{formatDate(story.createdAt)}</p>

              {story.text && <p style={{ whiteSpace: 'pre-wrap' }}>{story.text}</p>}

              {story.imageUrl && (
                <img
                  src={story.imageUrl}
                  alt="Story"
                  style={{
                    width: '100%',
                    maxHeight: 420,
                    objectFit: 'contain',
                    borderRadius: 24,
                    marginTop: 12,
                    marginBottom: 12,
                  }}
                />
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="primary" onClick={() => toggleLike(story)}>
                  {liked ? 'Unlike' : 'Like'} ({likes.length})
                </button>

                {(story.authorUid === member.uid || member.role === 'admin') && (
                  <button className="link-button" onClick={() => deleteStory(story)}>
                    Delete
                  </button>
                )}

                {member.role === 'admin' && (
                  <button className="link-button" onClick={() => togglePin(story)}>
                    {story.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <h3>Comments</h3>
                {storyComments.length === 0 && <p className="muted">No comments yet.</p>}

                {storyComments.map((comment) => (
                  <div className="bubble" key={comment.id}>
                    <strong>{comment.authorName}</strong>
                    <p>{comment.text}</p>
                    <p className="muted">{formatDate(comment.createdAt)}</p>
                  </div>
                ))}

                <form className="composer" onSubmit={(event) => addComment(event, story)}>
                  <input
                    value={commentDrafts[story.id] || ''}
                    onChange={(e) => setCommentDrafts((current) => ({
                      ...current,
                      [story.id]: e.target.value,
                    }))}
                    placeholder="Write a comment"
                    maxLength={500}
                  />
                  <button type="submit"><Send size={16} /> Comment</button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section className="room">
      <h2>Story Corner</h2>
      <p className="muted">Story Time is now split into My Stories, Request a Story, Read a Story for a Bubby, and Library.</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <button className={storySection === 'myStories' ? 'primary' : 'link-button'} onClick={() => setStorySection('myStories')}>
          🎧 My Stories ({myStories.length})
        </button>
        <button className={storySection === 'request' ? 'primary' : 'link-button'} onClick={() => setStorySection('request')}>
          📚 Request a Story
        </button>
        <button className={storySection === 'readForBubby' ? 'primary' : 'link-button'} onClick={() => setStorySection('readForBubby')}>
          🧸 Read a Story for a Bubby ({readForBubbyRequests.length})
        </button>
        <button className={storySection === 'library' ? 'primary' : 'link-button'} onClick={() => setStorySection('library')}>
          🏛️ Library ({publicLibrary.length})
        </button>
      </div>

      {status && <p className={status.includes('Could') || status.includes('Only') || status.includes('first') || status.includes('Please') || status.includes('Accept') || status.includes('already') || status.includes('private') || status.includes('choose') ? 'error' : 'success'}>{status}</p>}

      {storySection === 'myStories' && (
        <div className="profile">
          <h3>🎧 My Stories</h3>
          <p className="muted">Stories completed for you appear here.</p>

          {myStories.length === 0 && (
            <div className="bubble">
              <strong>No completed stories yet</strong>
              <p>Request a story and it will appear here when it is ready.</p>
            </div>
          )}

          {myStories.map((request) => (
            <StoryRequestCard key={request.id} request={request} mode="myStories" />
          ))}
        </div>
      )}

      {storySection === 'request' && (
        <>
          <div className="profile" style={{ marginBottom: 20 }}>
            <h3>📚 Request a Story Teller</h3>
            <p className="muted">Ask for a story to be read to you. Choose the reader voice and add a name if you want it included in the dialogue.</p>

            <form className="form compact" onSubmit={requestStoryTeller}>
              <label className="muted" htmlFor="readerPreference">Preferred reader</label>
              <select
                id="readerPreference"
                value={readerPreference}
                onChange={(e) => setReaderPreference(e.target.value)}
                style={{
                  width: '100%',
                  border: 0,
                  borderRadius: 20,
                  padding: 16,
                  background: '#f5f7fb',
                  color: '#24304d',
                  fontSize: 16,
                }}
              >
                <option>Male</option>
                <option>Female</option>
                <option>I don’t mind</option>
              </select>

              <input
                value={dialogueName}
                onChange={(e) => setDialogueName(e.target.value)}
                placeholder="Name to include in the story dialogue, optional"
                maxLength={80}
              />

              <textarea
                value={requestedStory}
                onChange={(e) => setRequestedStory(e.target.value)}
                placeholder="Enter the story you would like read"
                maxLength={4000}
              />

              <div
                style={{
                  background: '#fff0f7',
                  border: '2px solid #f9a8d4',
                  borderRadius: 22,
                  padding: 18,
                }}
              >
                <h3 style={{ marginTop: 0 }}>🔒 Request privacy</h3>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Choose who can see this story teller request.
                </p>

                <div style={{ display: 'grid', gap: 10 }}>
                  <button
                    type="button"
                    className={!privateRequest ? 'primary' : 'link-button'}
                    onClick={() => {
                      setPrivateRequest(false);
                      setChosenFriendUid('');
                    }}
                  >
                    Public request - all members can see and accept it
                  </button>

                  <button
                    type="button"
                    className={privateRequest ? 'primary' : 'link-button'}
                    onClick={() => setPrivateRequest(true)}
                  >
                    Private request - choose one friend to read it
                  </button>
                </div>

                {privateRequest && (
                  <div style={{ marginTop: 14 }}>
                    <label className="muted" htmlFor="chosenFriend">Choose friend reader</label>
                    {friends.length === 0 ? (
                      <p className="error">You need to add a friend before creating a private story request.</p>
                    ) : (
                      <select
                        id="chosenFriend"
                        value={chosenFriendUid}
                        onChange={(e) => setChosenFriendUid(e.target.value)}
                        style={{
                          width: '100%',
                          border: 0,
                          borderRadius: 20,
                          padding: 16,
                          background: '#f5f7fb',
                          color: '#24304d',
                          fontSize: 16,
                        }}
                      >
                        <option value="">Choose a friend</option>
                        {friends.map((friend) => (
                          <option key={friend.uid} value={friend.uid}>
                            {friend.displayName || friend.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <p className={privateRequest ? 'success' : 'muted'} style={{ marginTop: 14 }}>
                  Current setting: {privateRequest ? 'Private request between you and your chosen friend' : 'Public request'}
                </p>
              </div>

              <button type="submit" disabled={requesting}>
                {requesting ? 'Submitting...' : 'Request story teller'}
              </button>
            </form>
          </div>

          <div className="profile">
            <h3>My Active Story Requests</h3>
            <p className="muted">Requests you have made that are not finished yet.</p>

            {myActiveRequests.length === 0 && (
              <div className="bubble">
                <strong>No active requests</strong>
                <p>Your new story requests will appear here while they are waiting.</p>
              </div>
            )}

            {myActiveRequests.map((request) => (
              <StoryRequestCard key={request.id} request={request} mode="request" />
            ))}
          </div>
        </>
      )}

      {storySection === 'readForBubby' && (
        <div className="profile">
          <h3>🧸 Read a Story for a Bubby</h3>
          <p className="muted">This is the request board for stories waiting to be read. Public requests appear for all members. Private requests only appear for the chosen friend.</p>

          {readForBubbyRequests.length === 0 && (
            <div className="bubble">
              <strong>No stories waiting</strong>
              <p>The reading chair is empty for now.</p>
            </div>
          )}

          {readForBubbyRequests.map((request) => (
            <StoryRequestCard key={request.id} request={request} mode="readForBubby" />
          ))}
        </div>
      )}

      {storySection === 'library' && (
        <>
          <div className="profile">
            <h3>🏛️ Library</h3>
            <p className="muted">All completed public stories are available here for members to play.</p>

            {publicLibrary.length === 0 && (
              <div className="bubble">
                <strong>No public stories yet</strong>
                <p>Completed public story recordings will appear here.</p>
              </div>
            )}

            {publicLibrary.map((request) => (
              <StoryRequestCard key={request.id} request={request} mode="library" />
            ))}
          </div>

          {renderStoryPosts()}
        </>
      )}
    </section>
  );
}



function NaughtyBabyAdminQueue({ member }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const reportsQuery = query(collection(db, 'naughtyBabyReports'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const loadedReports = snapshot.docs
          .map((reportDoc) => ({ id: reportDoc.id, ...reportDoc.data() }))
          .filter((report) => !report.setupOnly);
        setReports(loadedReports);
      },
      (err) => setStatus(err.message || 'Could not load Naughty Baby Reports.')
    );

    return unsubscribe;
  }, []);

  async function updateReport(report, nextStatus) {
    await updateDoc(doc(db, 'naughtyBabyReports', report.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
      updatedByName: member.displayName,
    });

    setStatus(`Naughty Baby Report marked ${nextStatus}.`);
  }

  return (
    <div className="profile" style={{ marginTop: 20 }}>
      <h3>🚨 Naughty Baby Reports</h3>
      {status && <p className={status.includes('Could') ? 'error' : 'success'}>{status}</p>}

      {reports.length === 0 && <p className="muted">No Naughty Baby Reports.</p>}

      {reports.map((report) => (
        <div className="bubble" key={report.id}>
          <strong>{report.category}</strong>
          <p><strong>Reported baby:</strong> {report.reportedName}</p>
          <p><strong>Reported by:</strong> {report.reporterName}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{report.description}</p>
          {report.whenHappened && <p><strong>When:</strong> {report.whenHappened}</p>}
          {report.contactRequested && <p className="success">Reporter would like admin contact.</p>}
          <p className="muted">Status: {report.status || 'Submitted'} | Created: {formatDate(report.createdAt)}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => updateReport(report, 'Under Review')}>Review</button>
            <button className="link-button" onClick={() => updateReport(report, 'Resolved')}>Resolve</button>
            <button className="link-button" onClick={() => updateReport(report, 'Closed')}>Close</button>
          </div>
        </div>
      ))}
    </div>
  );
}


function AdminConsole({ member }) {
  const [users, setUsers] = useState([]);
  const [inviteCodes, setInviteCodes] = useState([]);
  const [reports, setReports] = useState([]);
  const [presenceList, setPresenceList] = useState([]);
  const [status, setStatus] = useState('');
  const [newCode, setNewCode] = useState(makeInviteCode());

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const inviteQuery = query(collection(db, 'inviteCodes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(inviteQuery, (snapshot) => {
      setInviteCodes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const reportQuery = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(reportQuery, (snapshot) => {
      setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const presenceQuery = query(collection(db, 'presence'));
    const unsubscribe = onSnapshot(presenceQuery, (snapshot) => {
      setPresenceList(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return unsubscribe;
  }, []);

  async function approveUser(user) {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: member.uid,
      });
      setStatus(`Approved ${user.displayName || user.email}.`);
    } catch (err) {
      setStatus(err.message || 'Could not approve user.');
    }
  }

  async function suspendUser(user) {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        status: 'suspended',
        suspendedAt: serverTimestamp(),
        suspendedBy: member.uid,
      });
      setStatus(`Suspended ${user.displayName || user.email}.`);
    } catch (err) {
      setStatus(err.message || 'Could not suspend user.');
    }
  }

  async function makeAdmin(user) {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        role: 'admin',
        roleUpdatedAt: serverTimestamp(),
        roleUpdatedBy: member.uid,
      });
      setStatus(`${user.displayName || user.email} is now a Helper Bubby admin.`);
    } catch (err) {
      setStatus(err.message || 'Could not update role.');
    }
  }

  async function createInviteCode(event) {
    event.preventDefault();

    const code = newCode.trim().toUpperCase();
    if (!code) return;

    try {
      await addDoc(collection(db, 'inviteCodes'), {
        code,
        used: false,
        createdAt: serverTimestamp(),
        createdBy: member.uid,
        createdByName: member.displayName,
      });
      setStatus(`Invite code created: ${code}`);
      setNewCode(makeInviteCode());
    } catch (err) {
      setStatus(err.message || 'Could not create invite code.');
    }
  }

  async function disableInviteCode(invite) {
    try {
      await updateDoc(doc(db, 'inviteCodes', invite.id), {
        used: true,
        disabledAt: serverTimestamp(),
        disabledBy: member.uid,
      });
      setStatus(`Invite code disabled: ${invite.code}`);
    } catch (err) {
      setStatus(err.message || 'Could not disable invite code.');
    }
  }

  async function resolveReport(report) {
    try {
      await updateDoc(doc(db, 'reports', report.id), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: member.uid,
      });
      setStatus('Report marked resolved.');
    } catch (err) {
      setStatus(err.message || 'Could not resolve report.');
    }
  }

  const pendingUsers = users.filter((user) => user.status === 'pendingApproval');
  const approvedUsers = users.filter((user) => user.status === 'approved');
  const suspendedUsers = users.filter((user) => user.status === 'suspended');
  const activeInvites = inviteCodes.filter((invite) => invite.used === false);
  const openReports = reports.filter((report) => report.status !== 'resolved' && !report.setupOnly);

  if (member.role !== 'admin') {
    return (
      <section className="room">
        <h2>Admin Console</h2>
        <p className="error">Only Helper Bubby admins can enter this room.</p>
      </section>
    );
  }

  return (
    <section className="room">
      <h2>Helper Bubby Admin Console</h2>
      <p className="muted">Approve members, create invite codes, view reports, and watch the little lights blink.</p>

      {status && <p className={status.includes('Could') ? 'error' : 'success'}>{status}</p>}

      <div className="cards">
        <div className="feature-card">
          <span>📊</span>
          <h3>Site Snapshot</h3>
          <p>Total users: {users.length}</p>
          <p>Pending approval: {pendingUsers.length}</p>
          <p>Approved: {approvedUsers.length}</p>
          <p>Suspended: {suspendedUsers.length}</p>
          <p>Active invite codes: {activeInvites.length}</p>
          <p>Open reports: {openReports.length}</p>
        </div>

        <div className="feature-card">
          <span>🎟️</span>
          <h3>Create Invite Code</h3>
          <form className="form compact" onSubmit={createInviteCode}>
            <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} />
            <button type="submit">Create invite code</button>
          </form>
          <button className="link-button" onClick={() => setNewCode(makeInviteCode())}>Generate new code</button>
        </div>

        <div className="feature-card">
          <span>🟢</span>
          <h3>Online Members</h3>
          {presenceList.length === 0 && <p>No presence records yet.</p>}
          {presenceList.map((person) => (
            <div className="bubble" key={person.id}>
              <strong>{person.displayName || person.email}</strong>
              <p>{person.email}</p>
              <p className="muted">{person.online ? '🟢 Online' : `⚪ Offline, last seen ${formatDate(person.lastSeen)}`}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Pending Member Approvals</h3>
        {pendingUsers.length === 0 && <p className="muted">No pending members.</p>}
        {pendingUsers.map((user) => (
          <div className="bubble" key={user.id}>
            <strong>{user.displayName || user.email}</strong>
            <p>{user.email}</p>
            <p className="muted">Joined: {formatDate(user.createdAt)}</p>
            <button className="primary" onClick={() => approveUser(user)}>Approve</button>
            <button className="link-button" onClick={() => suspendUser(user)}>Suspend</button>
          </div>
        ))}
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>All Members</h3>
        {users.length === 0 && <p className="muted">No users yet.</p>}
        {users.map((user) => (
          <div className="bubble" key={user.id}>
            <strong>{user.displayName || user.email}</strong>
            <p>{user.email}</p>
            <p className="muted">Role: {user.role || 'member'} | Status: {user.status || 'unknown'}</p>
            <button className="primary" onClick={() => approveUser(user)}>Approve</button>
            <button className="link-button" onClick={() => suspendUser(user)}>Suspend</button>
            {user.role !== 'admin' && <button className="link-button" onClick={() => makeAdmin(user)}>Make Helper Bubby Admin</button>}
          </div>
        ))}
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Invite Codes</h3>
        {inviteCodes.length === 0 && <p className="muted">No invite codes yet.</p>}
        {inviteCodes.map((invite) => (
          <div className="bubble" key={invite.id}>
            <strong>{invite.code || invite.id}</strong>
            <p className="muted">{invite.used ? 'Used / Disabled' : 'Active'}</p>
            {!invite.used && <button className="link-button" onClick={() => disableInviteCode(invite)}>Disable</button>}
          </div>
        ))}
      </div>

      <NaughtyBabyAdminQueue member={member} />

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Reports Queue</h3>
        {openReports.length === 0 && <p className="muted">No open reports.</p>}
        {openReports.map((report) => (
          <div className="bubble" key={report.id}>
            <strong>{report.type || 'Report'}</strong>
            <p>{report.details || report.note || 'No details provided.'}</p>
            <p className="muted">Status: {report.status || 'open'} | Created: {formatDate(report.createdAt)}</p>
            <button className="primary" onClick={() => resolveReport(report)}>Mark resolved</button>
          </div>
        ))}
      </div>
    </section>
  );
}



function MentorLoungeRoom({ member }) {
  const supportOptions = [
    'Making Friends',
    'Feeling Lonely',
    'Confidence',
    'Community Support',
    'Navigating Happy Little Bubbies',
    'Other',
  ];

  const mentorOptions = [
    'Making Friends',
    'Confidence',
    'Community Support',
    'Navigating Happy Little Bubbies',
    'General Chat',
  ];

  const [mentorRequests, setMentorRequests] = useState([]);
  const [mentorProfiles, setMentorProfiles] = useState([]);
  const [needHelpWith, setNeedHelpWith] = useState('');
  const [requestDetails, setRequestDetails] = useState('');
  const [canHelpWith, setCanHelpWith] = useState([]);
  const [mentorBio, setMentorBio] = useState('');
  const [status, setStatus] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [submittingMentor, setSubmittingMentor] = useState(false);

  useEffect(() => {
    const requestsQuery = query(collection(db, 'mentorRequests'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const loadedRequests = snapshot.docs
          .map((requestDoc) => ({ id: requestDoc.id, ...requestDoc.data() }))
          .filter((request) => !request.setupOnly)
          .filter((request) =>
            member.role === 'admin' ||
            request.requesterUid === member.uid ||
            request.acceptedByUid === member.uid
          );

        setMentorRequests(loadedRequests);
      },
      (err) => setStatus(err.message || 'Could not load mentor requests.')
    );

    return unsubscribe;
  }, [member.uid, member.role]);

  useEffect(() => {
    const profilesQuery = query(collection(db, 'mentorProfiles'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      profilesQuery,
      (snapshot) => {
        const loadedProfiles = snapshot.docs
          .map((profileDoc) => ({ id: profileDoc.id, ...profileDoc.data() }))
          .filter((profile) => !profile.setupOnly && profile.status !== 'removed');

        setMentorProfiles(loadedProfiles);
      },
      (err) => setStatus(err.message || 'Could not load mentor profiles.')
    );

    return unsubscribe;
  }, []);

  function toggleHelpOption(option) {
    setCanHelpWith((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  }

  async function submitMentorRequest(event) {
    event.preventDefault();
    setStatus('');

    if (!needHelpWith) {
      setStatus('Please choose what you need help with.');
      return;
    }

    if (!requestDetails.trim()) {
      setStatus('Please add a short note about what kind of support you would like.');
      return;
    }

    setSubmittingRequest(true);

    try {
      await addDoc(collection(db, 'mentorRequests'), {
        requesterUid: member.uid,
        requesterName: member.displayName,
        requesterEmail: member.email,
        needHelpWith,
        requestDetails: requestDetails.trim(),
        status: 'Open',
        createdAt: serverTimestamp(),
      });

      setNeedHelpWith('');
      setRequestDetails('');
      setStatus('Mentor request submitted.');
    } catch (err) {
      setStatus(err.message || 'Could not submit mentor request.');
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function submitMentorProfile(event) {
    event.preventDefault();
    setStatus('');

    if (canHelpWith.length === 0) {
      setStatus('Please choose at least one area you can help with.');
      return;
    }

    if (!mentorBio.trim()) {
      setStatus('Please add a short mentor introduction.');
      return;
    }

    setSubmittingMentor(true);

    try {
      await addDoc(collection(db, 'mentorProfiles'), {
        mentorUid: member.uid,
        mentorName: member.displayName,
        mentorEmail: member.email,
        canHelpWith,
        mentorBio: mentorBio.trim(),
        status: member.role === 'admin' ? 'Approved' : 'Pending Approval',
        createdAt: serverTimestamp(),
      });

      setCanHelpWith([]);
      setMentorBio('');
      setStatus('Mentor profile submitted.');
    } catch (err) {
      setStatus(err.message || 'Could not submit mentor profile.');
    } finally {
      setSubmittingMentor(false);
    }
  }

  async function acceptMentorRequest(request) {
    if (request.requesterUid === member.uid) {
      setStatus('You cannot accept your own mentor request.');
      return;
    }

    await updateDoc(doc(db, 'mentorRequests', request.id), {
      status: 'Matched',
      acceptedByUid: member.uid,
      acceptedByName: member.displayName,
      acceptedByEmail: member.email,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'privateMessages'), {
      fromUid: member.uid,
      fromEmail: member.email,
      fromName: member.displayName,
      toUid: request.requesterUid,
      toEmail: request.requesterEmail,
      toName: request.requesterName,
      body: `${member.displayName} has accepted your Mentor Lounge request for ${request.needHelpWith}.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    setStatus('Mentor request accepted and requester notified.');
  }

  async function updateMentorRequest(request, nextStatus) {
    const canManage =
      member.role === 'admin' ||
      request.requesterUid === member.uid ||
      request.acceptedByUid === member.uid;

    if (!canManage) {
      setStatus('Only the requester, mentor, or Helper Bubby admin can update this request.');
      return;
    }

    await updateDoc(doc(db, 'mentorRequests', request.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
      updatedByName: member.displayName,
    });

    setStatus(`Mentor request marked ${nextStatus}.`);
  }

  async function updateMentorProfile(profile, nextStatus) {
    if (member.role !== 'admin') {
      setStatus('Only Helper Bubby admins can approve mentor profiles.');
      return;
    }

    await updateDoc(doc(db, 'mentorProfiles', profile.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
      updatedByName: member.displayName,
    });

    setStatus(`Mentor profile marked ${nextStatus}.`);
  }

  const openRequests = mentorRequests.filter((request) => request.status === 'Open');
  const myRequests = mentorRequests.filter((request) => request.requesterUid === member.uid);
  const matchedRequests = mentorRequests.filter((request) => request.acceptedByUid === member.uid);
  const approvedMentors = mentorProfiles.filter((profile) => profile.status === 'Approved');
  const pendingMentors = mentorProfiles.filter((profile) => profile.status === 'Pending Approval');

  return (
    <section className="room">
      <h2>Mentor Lounge</h2>
      <p className="muted">
        Mentor Lounge is for friendship, encouragement, confidence, and community support. Mentors are not counsellors, medical professionals, or legal advisors.
      </p>

      <div className="profile" style={{ marginBottom: 20 }}>
        <h3>🧸 Safety Note</h3>
        <p className="muted">
          If someone needs urgent help or professional support, they should contact an appropriate professional service. Happy Little Bubbies mentors provide friendly community support only.
        </p>
      </div>

      {status && <p className={status.includes('submitted') || status.includes('accepted') || status.includes('marked') ? 'success' : 'error'}>{status}</p>}

      <div className="cards">
        <div className="feature-card">
          <span>🌱</span>
          <h3>Need a Mentor</h3>
          <form className="form compact" onSubmit={submitMentorRequest}>
            <label className="muted" htmlFor="needHelpWith">I need help with</label>
            <select
              id="needHelpWith"
              value={needHelpWith}
              onChange={(e) => setNeedHelpWith(e.target.value)}
              style={{
                width: '100%',
                border: 0,
                borderRadius: 20,
                padding: 16,
                background: '#f5f7fb',
                color: '#24304d',
                fontSize: 16,
              }}
            >
              <option value="">Choose one</option>
              {supportOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>

            <textarea
              value={requestDetails}
              onChange={(e) => setRequestDetails(e.target.value)}
              placeholder="What kind of support would you like?"
              maxLength={1500}
            />

            <button type="submit" disabled={submittingRequest}>
              {submittingRequest ? 'Submitting...' : 'Request Mentor'}
            </button>
          </form>
        </div>

        <div className="feature-card">
          <span>💙</span>
          <h3>Be a Mentor</h3>
          <p className="muted">Choose the areas where you can offer friendly community support.</p>

          <div style={{ display: 'grid', gap: 8 }}>
            {mentorOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={canHelpWith.includes(option) ? 'primary' : 'link-button'}
                onClick={() => toggleHelpOption(option)}
              >
                {canHelpWith.includes(option) ? '✓ ' : ''}{option}
              </button>
            ))}
          </div>

          <form className="form compact" onSubmit={submitMentorProfile} style={{ marginTop: 12 }}>
            <textarea
              value={mentorBio}
              onChange={(e) => setMentorBio(e.target.value)}
              placeholder="Write a short mentor introduction"
              maxLength={1200}
            />

            <button type="submit" disabled={submittingMentor}>
              {submittingMentor ? 'Submitting...' : 'Submit Mentor Profile'}
            </button>
          </form>
        </div>
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Open Mentor Requests</h3>
        {openRequests.length === 0 && <p className="muted">No open mentor requests.</p>}

        {openRequests.map((request) => (
          <div className="bubble" key={request.id}>
            <strong>{request.requesterName}</strong>
            <p><strong>Needs help with:</strong> {request.needHelpWith}</p>
            <p>{request.requestDetails}</p>
            <p className="muted">Status: {request.status} | Created: {formatDate(request.createdAt)}</p>
            {request.requesterUid !== member.uid && (
              <button className="primary" onClick={() => acceptMentorRequest(request)}>
                Accept Mentor Request
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>My Mentor Requests</h3>
        {myRequests.length === 0 && <p className="muted">You have no mentor requests yet.</p>}

        {myRequests.map((request) => (
          <div className="bubble" key={request.id}>
            <strong>{request.needHelpWith}</strong>
            <p>{request.requestDetails}</p>
            {request.acceptedByName && <p className="success">Mentor: {request.acceptedByName}</p>}
            <p className="muted">Status: {request.status}</p>
            {request.status !== 'Closed' && (
              <button className="link-button" onClick={() => updateMentorRequest(request, 'Closed')}>
                Close Request
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Requests I Am Helping With</h3>
        {matchedRequests.length === 0 && <p className="muted">You have not accepted any mentor requests yet.</p>}

        {matchedRequests.map((request) => (
          <div className="bubble" key={request.id}>
            <strong>{request.requesterName}</strong>
            <p><strong>Support area:</strong> {request.needHelpWith}</p>
            <p>{request.requestDetails}</p>
            <p className="muted">Status: {request.status}</p>
            <button className="link-button" onClick={() => updateMentorRequest(request, 'Completed')}>
              Mark Completed
            </button>
          </div>
        ))}
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Approved Mentors</h3>
        {approvedMentors.length === 0 && <p className="muted">No approved mentors yet.</p>}

        {approvedMentors.map((profile) => (
          <div className="bubble" key={profile.id}>
            <strong>{profile.mentorName}</strong>
            <p>{profile.mentorBio}</p>
            <p className="muted">Can help with: {(profile.canHelpWith || []).join(', ')}</p>
          </div>
        ))}
      </div>

      {member.role === 'admin' && (
        <div className="profile" style={{ marginTop: 20 }}>
          <h3>Pending Mentor Profiles</h3>
          {pendingMentors.length === 0 && <p className="muted">No mentor profiles awaiting approval.</p>}

          {pendingMentors.map((profile) => (
            <div className="bubble" key={profile.id}>
              <strong>{profile.mentorName}</strong>
              <p>{profile.mentorBio}</p>
              <p className="muted">Can help with: {(profile.canHelpWith || []).join(', ')}</p>
              <button className="primary" onClick={() => updateMentorProfile(profile, 'Approved')}>
                Approve Mentor
              </button>
              <button className="link-button" onClick={() => updateMentorProfile(profile, 'Declined')}>
                Decline
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


function NaughtyBabyRoom({ member }) {
  const [members, setMembers] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportedUid, setReportedUid] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [whenHappened, setWhenHappened] = useState('');
  const [contactRequested, setContactRequested] = useState('Yes');
  const [extraNotes, setExtraNotes] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const loadedMembers = snapshot.docs
          .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
          .filter((user) => user.uid !== member.uid)
          .filter((user) => user.status !== 'suspended');

        setMembers(loadedMembers);
      },
      (err) => setStatus(err.message || 'Could not load member list.')
    );

    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const reportsQuery = query(collection(db, 'naughtyBabyReports'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const loadedReports = snapshot.docs
          .map((reportDoc) => ({ id: reportDoc.id, ...reportDoc.data() }))
          .filter((report) => !report.setupOnly)
          .filter((report) => report.reporterUid === member.uid || member.role === 'admin');

        setReports(loadedReports);
      },
      (err) => setStatus(err.message || 'Could not load reports.')
    );

    return unsubscribe;
  }, [member.uid, member.role]);

  async function submitReport(event) {
    event.preventDefault();
    setStatus('');

    const reportedMember = members.find((person) => person.uid === reportedUid);

    if (!reportedMember) {
      setStatus('Please select who was the naughty baby.');
      return;
    }

    if (!category) {
      setStatus('Please choose the type of concern.');
      return;
    }

    if (!description.trim()) {
      setStatus('Please describe what happened.');
      return;
    }

    if (reportedMember.uid === member.uid) {
      setStatus('You cannot report yourself as a naughty baby.');
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, 'naughtyBabyReports'), {
        reporterUid: member.uid,
        reporterName: member.displayName,
        reporterEmail: member.email,
        reportedUid: reportedMember.uid,
        reportedName: reportedMember.displayName || reportedMember.email,
        reportedEmail: reportedMember.email,
        category,
        description: description.trim(),
        whenHappened: whenHappened.trim(),
        contactRequested: contactRequested === 'Yes',
        extraNotes: extraNotes.trim(),
        status: 'Submitted',
        createdAt: serverTimestamp(),
      });

      setReportedUid('');
      setCategory('');
      setDescription('');
      setWhenHappened('');
      setContactRequested('Yes');
      setExtraNotes('');
      setStatus('Naughty Baby Report submitted.');
    } catch (err) {
      setStatus(err.message || 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateReport(report, nextStatus) {
    if (member.role !== 'admin') {
      setStatus('Only Helper Bubby admins can update reports.');
      return;
    }

    await updateDoc(doc(db, 'naughtyBabyReports', report.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: member.uid,
      updatedByName: member.displayName,
    });

    setStatus(`Report marked ${nextStatus}.`);
  }

  return (
    <section className="room">
      <h2>Report a Naughty Baby</h2>
      <p className="muted">Tell a Helper Bubby admin about behaviour that needs attention. The reported baby is required so the team can action it properly.</p>

      <div className="profile" style={{ marginBottom: 20 }}>
        <h3>🚨 Naughty Baby Report</h3>

        <form className="form compact" onSubmit={submitReport}>
          <label className="muted" htmlFor="reportedBaby">Who was the naughty baby? *</label>
          <select
            id="reportedBaby"
            value={reportedUid}
            onChange={(e) => setReportedUid(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            <option value="">Select member</option>
            {members.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.displayName || person.email}
              </option>
            ))}
          </select>

          <label className="muted" htmlFor="concernType">Type of concern *</label>
          <select
            id="concernType"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            <option value="">Select concern</option>
            <option>Bullying</option>
            <option>Mean Messages</option>
            <option>Inappropriate Content</option>
            <option>Pretending To Be Someone Else</option>
            <option>Safety Concern</option>
            <option>Spam</option>
            <option>Other</option>
          </select>

          <label className="muted" htmlFor="description">What happened? *</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened"
            maxLength={3000}
          />

          <input
            value={whenHappened}
            onChange={(e) => setWhenHappened(e.target.value)}
            placeholder="When did it happen? Optional"
          />

          <label className="muted" htmlFor="contactRequested">Would you like an admin to contact you?</label>
          <select
            id="contactRequested"
            value={contactRequested}
            onChange={(e) => setContactRequested(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            <option>Yes</option>
            <option>No</option>
          </select>

          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Additional comments, optional"
            maxLength={2000}
          />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : '🚨 Report Naughty Baby'}
          </button>
        </form>

        {status && <p className={status.includes('submitted') || status.includes('marked') ? 'success' : 'error'}>{status}</p>}
      </div>

      <div className="profile">
        <h3>{member.role === 'admin' ? 'Naughty Baby Reports Queue' : 'My Naughty Baby Reports'}</h3>
        {reports.length === 0 && (
          <div className="bubble">
            <strong>No reports yet</strong>
            <p className="muted">All quiet in the nursery.</p>
          </div>
        )}

        {reports.map((report) => (
          <div className="bubble" key={report.id}>
            <strong>{report.category}</strong>
            <p><strong>Reported baby:</strong> {report.reportedName}</p>
            {member.role === 'admin' && <p><strong>Reported by:</strong> {report.reporterName}</p>}
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.description}</p>
            {report.whenHappened && <p><strong>When:</strong> {report.whenHappened}</p>}
            {report.extraNotes && <p><strong>Extra notes:</strong> {report.extraNotes}</p>}
            <p className="muted">Status: {report.status || 'Submitted'} | Created: {formatDate(report.createdAt)}</p>
            {member.role === 'admin' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="primary" onClick={() => updateReport(report, 'Under Review')}>Review</button>
                <button className="link-button" onClick={() => updateReport(report, 'Resolved')}>Resolve</button>
                <button className="link-button" onClick={() => updateReport(report, 'Closed')}>Close</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}


function PlaceholderRoom({ title }) {
  return (
    <section className="room">
      <h2>{title}</h2>
      <p className="muted">This room is ready for the next stage.</p>
    </section>
  );
}




function getBubbleTheme(colourName) {
  const themes = {
    'Baby Blue': {
      background: 'linear-gradient(135deg,#e8f0ff 0%,#f7fbff 50%,#ffffff 100%)',
      accent: '#60a5fa',
      accentSoft: '#dbeafe',
      glow: '0 18px 45px rgba(96, 165, 250, 0.18)',
      text: '#1e3a8a',
      mutedText: '#475569',
      buttonText: '#ffffff',
      cardText: '#1e3a8a',
    },
    'Pastel Pink': {
      background: 'linear-gradient(135deg,#ffe4f1 0%,#fff5fa 50%,#ffffff 100%)',
      accent: '#ec4899',
      accentSoft: '#fce7f3',
      glow: '0 18px 45px rgba(236, 72, 153, 0.18)',
      text: '#831843',
      mutedText: '#6b4258',
      buttonText: '#ffffff',
      cardText: '#831843',
    },
    'Lavender': {
      background: 'linear-gradient(135deg,#ede9fe 0%,#faf5ff 50%,#ffffff 100%)',
      accent: '#8b5cf6',
      accentSoft: '#ede9fe',
      glow: '0 18px 45px rgba(139, 92, 246, 0.18)',
      text: '#4c1d95',
      mutedText: '#5b526f',
      buttonText: '#ffffff',
      cardText: '#4c1d95',
    },
    'Mint': {
      background: 'linear-gradient(135deg,#dcfce7 0%,#f0fdf4 50%,#ffffff 100%)',
      accent: '#10b981',
      accentSoft: '#d1fae5',
      glow: '0 18px 45px rgba(16, 185, 129, 0.18)',
      text: '#14532d',
      mutedText: '#3f5f4d',
      buttonText: '#ffffff',
      cardText: '#14532d',
    },
    'Sunshine': {
      background: 'linear-gradient(135deg,#fef3c7 0%,#fffbeb 50%,#ffffff 100%)',
      accent: '#f59e0b',
      accentSoft: '#fef3c7',
      glow: '0 18px 45px rgba(245, 158, 11, 0.2)',
      text: '#78350f',
      mutedText: '#6b5a3a',
      buttonText: '#ffffff',
      cardText: '#78350f',
    },
    'Cotton Cloud': {
      background: 'linear-gradient(135deg,#f8fafc 0%,#eef2ff 50%,#ffffff 100%)',
      accent: '#64748b',
      accentSoft: '#e2e8f0',
      glow: '0 18px 45px rgba(100, 116, 139, 0.18)',
      text: '#334155',
      mutedText: '#64748b',
      buttonText: '#ffffff',
      cardText: '#334155',
    },
  };

  return themes[colourName] || themes['Baby Blue'];
}

function BubbleThemeStyles({ theme }) {
  return (
    <style>{`
      .app {
        color: ${theme.text};
      }

      .app h1,
      .app h2,
      .app h3,
      .app strong {
        color: ${theme.text};
      }

      .app p,
      .app label {
        color: ${theme.cardText};
      }

      .app .muted {
        color: ${theme.mutedText} !important;
      }

      .app .profile,
      .app .feature-card,
      .app .bubble,
      .app .auth-card {
        color: ${theme.cardText};
      }

      .app .primary {
        background: ${theme.accent} !important;
        color: ${theme.buttonText} !important;
        border-color: ${theme.accent} !important;
      }

      .app .link-button {
        color: ${theme.text} !important;
      }

      .app .sidebar button.active {
        background: ${theme.accentSoft} !important;
        color: ${theme.text} !important;
      }

      .app input,
      .app textarea,
      .app select {
        color: ${theme.text} !important;
      }

      .app .avatar {
        background: ${theme.accentSoft} !important;
        border: 4px solid ${theme.accent} !important;
        box-shadow: ${theme.glow} !important;
      }

      .app .badge,
      .app [class*="badge"] {
        background: ${theme.accent} !important;
        color: ${theme.buttonText} !important;
      }

      .app .signout {
        background: ${theme.accent} !important;
        color: ${theme.buttonText} !important;
        box-shadow: ${theme.glow} !important;
      }

      .app small {
        color: ${theme.accent} !important;
      }

      .app a {
        color: ${theme.accent} !important;
      }

      .app .success {
        background: ${theme.accentSoft} !important;
        color: ${theme.text} !important;
      }

      .app input:focus,
      .app textarea:focus,
      .app select:focus {
        outline: 3px solid ${theme.accentSoft} !important;
        border-color: ${theme.accent} !important;
      }

      .app .active {
        color: ${theme.text} !important;
      }
    `}</style>
  );
}


function ProfileRoom({ member, setMember }) {
  const avatarOptions = ['🧸', '🍼', '🌈', '⭐', '☁️', '🐣', '🎀', '🦄', '🐻', '📚'];
  const colourOptions = ['Baby Blue', 'Pastel Pink', 'Lavender', 'Mint', 'Sunshine', 'Cotton Cloud'];
  const genderOptions = [
    'Prefer not to say',
    'Female',
    'Male',
    'Non-binary',
    'Gender diverse',
    'Genderqueer',
    'Agender',
    'Bigender',
    'Genderfluid',
    'Transgender female',
    'Transgender male',
    'Transgender',
    'Intersex',
    'Two-Spirit',
    'Questioning',
    'Self-describe',
  ];
  const interestOptions = [
    'Little',
    'Middle',
    'Caregiver',
    'Mommy',
    'Daddy',
    'Auntie',
    'Uncle',
    'Babysitter',
    'Story Teller',
    'Mentor',
    'Age Regressor',
    'Friendships Only',
    'Looking for Pen Pals',
    'Looking for Story Readers',
    'Community Support',
  ];

  const [displayName, setDisplayName] = useState(member.displayName || '');
  const [bio, setBio] = useState(member.bio || '');
  const [avatar, setAvatar] = useState(member.avatar || '🧸');
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [favouriteColour, setFavouriteColour] = useState(member.favouriteColour || 'Baby Blue');
  const [gender, setGender] = useState(member.gender || 'Prefer not to say');
  const [customGender, setCustomGender] = useState(member.customGender || '');
  const [communityInterests, setCommunityInterests] = useState(member.communityInterests || []);
  const [interestsVisibility, setInterestsVisibility] = useState(member.interestsVisibility || 'Public');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [friendCount, setFriendCount] = useState(0);
  const [mentorProfile, setMentorProfile] = useState(null);

  useEffect(() => {
    const friendsQuery = query(collection(db, 'friends'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      friendsQuery,
      (snapshot) => {
        const count = snapshot.docs
          .map((friendDoc) => friendDoc.data())
          .filter((friend) => friend.userIds?.includes(member.uid))
          .length;

        setFriendCount(count);
      },
      () => {}
    );

    return unsubscribe;
  }, [member.uid]);

  useEffect(() => {
    const mentorQuery = query(
      collection(db, 'mentorProfiles'),
      where('mentorUid', '==', member.uid),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      mentorQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setMentorProfile(null);
          return;
        }

        setMentorProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      },
      () => {}
    );

    return unsubscribe;
  }, [member.uid]);

  function toggleCommunityInterest(option) {
    setCommunityInterests((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  }

  async function uploadProfilePhoto(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatus('Please upload an image file.');
      return;
    }

    setPhotoUploading(true);
    setStatus('');

    try {
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const storagePath = `profilePhotos/${member.uid}/profile-photo.${fileExtension}`;
      const photoRef = ref(storage, storagePath);

      await uploadBytes(photoRef, file, {
        contentType: file.type || 'image/jpeg',
      });

      const uploadedPhotoUrl = await getDownloadURL(photoRef);
      setPhotoUrl(uploadedPhotoUrl);
      setStatus('Profile photo uploaded. Click Save My Bubble to keep it.');
    } catch (err) {
      setStatus(err.message || 'Could not upload profile photo.');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setStatus('');

    const cleanName = displayName.trim();
    const cleanBio = bio.trim();

    if (!cleanName) {
      setStatus('Display name is required.');
      return;
    }

    setSaving(true);

    try {
      const updatedProfile = {
        displayName: cleanName,
        bio: cleanBio,
        avatar,
        photoUrl,
        favouriteColour,
        gender,
        customGender: gender === 'Self-describe' ? customGender.trim() : '',
        communityInterests,
        interestsVisibility,
        profileUpdatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'users', member.uid), updatedProfile);

      await setDoc(doc(db, 'presence', member.uid), {
        uid: member.uid,
        email: member.email,
        displayName: cleanName,
        avatar,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setMember({
        ...member,
        ...updatedProfile,
        displayName: cleanName,
        bio: cleanBio,
        avatar,
        photoUrl,
        favouriteColour,
        gender,
        customGender: gender === 'Self-describe' ? customGender.trim() : '',
        communityInterests,
        interestsVisibility,
      });

      setStatus('Profile updated.');
    } catch (err) {
      setStatus(err.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }

  const previewTheme = getBubbleTheme(favouriteColour);

  return (
    <section className="room">
      <h2>My Bubble</h2>

      <div
        className="profile"
        style={{
          borderTop: `6px solid ${previewTheme.accent}`,
          boxShadow: previewTheme.glow,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="Profile"
            className="avatar"
            style={{
              width: 120,
              height: 120,
              objectFit: 'contain',
              borderRadius: '50%',
              background: '#ffffff',
              padding: 4,
            }}
          />
        ) : (
          <div className="avatar">{avatar}</div>
        )}
        <h3>{member.displayName}</h3>
        <p>{member.email}</p>
        {member.bio && <p style={{ whiteSpace: 'pre-wrap' }}>{member.bio}</p>}

        <p><strong>Role:</strong> {member.role === 'admin' ? 'Helper Bubby' : 'Member'}</p>
        <p><strong>Status:</strong> {member.status}</p>
        <p><strong>Favourite colour:</strong> {member.favouriteColour || 'Baby Blue'}</p>
        <p><strong>Gender:</strong> {member.gender === 'Self-describe' ? member.customGender || 'Self-described' : member.gender || 'Prefer not to say'}</p>
        <p><strong>Community interests:</strong> {(member.communityInterests || []).length ? member.communityInterests.join(', ') : 'None selected'}</p>
        <p><strong>Interests visibility:</strong> {member.interestsVisibility || 'Public'}</p>
        <p><strong>Friends:</strong> {friendCount}</p>
        <p><strong>Mentor status:</strong> {mentorProfile ? mentorProfile.status : 'Not a mentor yet'}</p>
        <p><strong>User ID:</strong> {member.uid}</p>

        <div className="badges">
          {(member.badges || ['🐣 Little Hatchling']).map((badge) => <span key={badge}>{badge}</span>)}
          {mentorProfile?.status === 'Approved' && <span>💙 Approved Mentor</span>}
          {member.role === 'admin' && <span>🛠️ Helper Bubby Admin</span>}
        </div>
      </div>

      <div className="profile" style={{ marginTop: 20 }}>
        <h3>Edit My Bubble</h3>

        <form className="form compact" onSubmit={saveProfile}>
          <label className="muted" htmlFor="displayName">Display name *</label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            maxLength={60}
          />

          <label className="muted">Choose avatar</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
              gap: 10,
            }}
          >
            {avatarOptions.map((item) => (
              <button
                key={item}
                type="button"
                className={avatar === item ? 'primary' : 'link-button'}
                onClick={() => setAvatar(item)}
                style={{ fontSize: 28 }}
              >
                {item}
              </button>
            ))}
          </div>

          <div
            style={{
              background: '#f5f7fb',
              borderRadius: 22,
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Profile Photo</h3>
            <p className="muted">Upload a photo if you want to use it instead of an emoji avatar.</p>

            {photoUrl && (
              <img
                src={photoUrl}
                alt="Profile preview"
                style={{
                  width: 120,
                  height: 120,
                  objectFit: 'contain',
                  borderRadius: '50%',
                  background: '#ffffff',
                  padding: 4,
                  border: `4px solid ${previewTheme.accent}`,
                  boxShadow: previewTheme.glow,
                  display: 'block',
                  marginBottom: 12,
                }}
              />
            )}

            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadProfilePhoto(e.target.files?.[0])}
            />

            {photoUploading && <p className="muted">Uploading profile photo...</p>}

            {photoUrl && (
              <button
                type="button"
                className="link-button"
                onClick={() => setPhotoUrl('')}
                style={{ marginTop: 10 }}
              >
                Use emoji avatar instead
              </button>
            )}
          </div>

          <label className="muted" htmlFor="favouriteColour">Favourite colour/theme</label>
          <select
            id="favouriteColour"
            value={favouriteColour}
            onChange={(e) => setFavouriteColour(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            {colourOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <div
            style={{
              background: previewTheme.background,
              border: `2px solid ${previewTheme.accent}`,
              borderRadius: 22,
              padding: 16,
              boxShadow: previewTheme.glow,
              color: previewTheme.text,
            }}
          >
            <strong style={{ color: previewTheme.text }}>Theme preview: {favouriteColour}</strong>
            <p style={{ color: previewTheme.mutedText }}>This colour will change the background, text, buttons, and avatar after you save.</p>
          </div>

          <label className="muted" htmlFor="gender">Gender</label>
          <select
            id="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            {genderOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          {gender === 'Self-describe' && (
            <input
              value={customGender}
              onChange={(e) => setCustomGender(e.target.value)}
              placeholder="Enter your gender"
              maxLength={80}
            />
          )}

          <div
            style={{
              background: '#f5f7fb',
              borderRadius: 22,
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Community Interests</h3>
            <p className="muted">Choose as many as you like.</p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              {interestOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={communityInterests.includes(option) ? 'primary' : 'link-button'}
                  onClick={() => toggleCommunityInterest(option)}
                >
                  {communityInterests.includes(option) ? '✓ ' : ''}{option}
                </button>
              ))}
            </div>
          </div>

          <label className="muted" htmlFor="interestsVisibility">Community Interests Visibility</label>
          <select
            id="interestsVisibility"
            value={interestsVisibility}
            onChange={(e) => setInterestsVisibility(e.target.value)}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 20,
              padding: 16,
              background: '#f5f7fb',
              color: '#24304d',
              fontSize: 16,
            }}
          >
            <option>Public</option>
            <option>Friends Only</option>
            <option>Private</option>
          </select>

          <label className="muted" htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell the community a little about you"
            maxLength={800}
          />

          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save My Bubble'}
          </button>
        </form>

        {status && <p className={status.includes('updated') ? 'success' : 'error'}>{status}</p>}
      </div>
    </section>
  );
}


function AppShell({ member, setMember }) {
  usePresence(member);
  const counts = useNotificationCounts(member);
  const rooms = getRooms(member);
  const [room, setRoom] = useState(() => roomFromPath(window.location.pathname));
  const active = rooms.find((item) => item.id === room) || rooms[0];
  const bubbleTheme = getBubbleTheme(member.favouriteColour);

  useEffect(() => {
    const handlePopState = () => {
      setRoom(roomFromPath(window.location.pathname));
      window.scrollTo({ top: 0, behavior: 'instant' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigateTo(nextRoom) {
    const nextPath = pathFromRoom(nextRoom);
    const currentPath = window.location.pathname;

    if (currentPath !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }

    setRoom(nextRoom);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main
      className="app"
      style={{
        background: bubbleTheme.background,
        color: bubbleTheme.text,
        transition: 'background 300ms ease, color 300ms ease',
      }}
    >
      <BubbleThemeStyles theme={bubbleTheme} />
      <aside className="sidebar">
        <Logo goHome={() => navigateTo('home')} />
        <nav>
          {rooms.map((item) => {
            const Icon = item.icon;
            let count = 0;
            if (item.id === 'inbox') count = counts.inbox;
            if (item.id === 'friends') count = counts.friendRequests;
            if (item.id === 'friendChat') count = counts.friendChat;
            if (item.id === 'notifications') count = counts.total;

            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={room === item.id ? 'active' : ''}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <Icon size={17} /> {item.label}
                <Badge count={count} />
              </button>
            );
          })}
        </nav>
        <button className="signout" onClick={() => signOut(auth)}>Sign out</button>
      </aside>

      <section className="panel" key={room}>
        <header>
          <Logo goHome={() => navigateTo('home')} />
          <div>
            <small>Stage 26 member invites build</small>
            <h2>{active.label}</h2>
          </div>
        </header>

        {room === 'home' && <HomeRoom setRoom={navigateTo} member={member} counts={counts} />}
        {room === 'chat' && <ChatRoom member={member} />}
        {room === 'inbox' && <InboxRoom member={member} />}
        {room === 'friends' && <FriendsRoom member={member} />}
        {room === 'friendChat' && <FriendChatRoom member={member} />}
        {room === 'notifications' && <NotificationsRoom member={member} counts={counts} />}
        {room === 'stories' && <StoryCornerRoom member={member} />}
        {room === 'admin' && <AdminConsole member={member} />}
        {room === 'profile' && <ProfileRoom member={member} setMember={setMember} />}
        {room === 'mentors' && <MentorLoungeRoom member={member} />}
        {room === 'safety' && <NaughtyBabyRoom member={member} />}
        {room !== 'home' && room !== 'chat' && room !== 'inbox' && room !== 'friends' && room !== 'friendChat' && room !== 'notifications' && room !== 'stories' && room !== 'admin' && room !== 'profile' && room !== 'safety' && room !== 'mentors' && <PlaceholderRoom title={active.label} />}
      </section>
    </main>
  );
}


function Root() {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setMember(null);
        setLoading(false);
        return;
      }

      const profile = await getUserProfile(currentUser.uid);
      setMember(profile);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) return <main className="auth-page"><p>Loading little bubbles...</p></main>;
  if (!member) return <AuthGate setMember={setMember} />;
  return <AppShell member={member} setMember={setMember} />;
}

createRoot(document.getElementById('root')).render(<Root />);
