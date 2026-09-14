import { state } from './state.js';
import { db, appId, doc, collection, addDoc, setDoc, onSnapshot, serverTimestamp } from './firebase.js';
import { defaultAvatarFor, pushNotification } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { finalizeSwap } from './swaps.js';

export async function startCallUI(remoteUserId, swapId = null) {
  if (!state.currentUser || !remoteUserId) { alert('Not authenticated.'); return; }
  const callId = [state.currentUser.uid, remoteUserId, Date.now()].join('_');
  const callRef = doc(db, `/artifacts/${appId}/calls/${callId}`);
  await setDoc(callRef, {
    caller: state.currentUser.uid,
    callee: remoteUserId,
    status: 'initiated',
    startedAt: serverTimestamp(),
    swapId: swapId || null
  });

  await pushNotification(remoteUserId, {
    type: 'incoming_call',
    callId,
    fromUserId: state.currentUser.uid,
    fromUserName: state.currentUser.displayName || state.currentUser.email?.split('@')[0] || 'User',
    fromUserAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
    textPreview: 'Incoming video call!'
  });

  showVideoCallModal(callId, true, remoteUserId, swapId);
}

export async function joinCall(callId) {
  showVideoCallModal(callId, false);
}

function showVideoCallModal(callId, isCaller, remoteUserIdParam = null, swapId = null) {
  renderModal(`
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">Video Call</h2>
      <div class="flex flex-col md:flex-row gap-4">
        <video id="localVideo" autoplay playsinline muted class="w-full md:w-1/2 bg-black rounded"></video>
        <video id="remoteVideo" autoplay playsinline class="w-full md:w-1/2 bg-black rounded"></video>
      </div>
      <div class="flex justify-end mt-4 space-x-4">
        ${swapId ? `<button id="end-swap-btn" class="bg-green-600 text-white px-4 py-2 rounded">Complete Swap</button>` : ""}
        <button id="hangup-btn" class="bg-red-600 text-white px-4 py-2 rounded">Hang Up</button>
      </div>
      <div id="call-status" class="mt-4 text-gray-600"></div>
    </div>
  `);

  let pc = null, localStream = null, unsubSignal = null;
  const callRef = doc(db, `/artifacts/${appId}/calls/${callId}`);
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const callStatus = document.getElementById('call-status');
  const hangupBtn = document.getElementById('hangup-btn');
  const endSwapBtn = document.getElementById('end-swap-btn');

  async function cleanup(reason) {
    if (unsubSignal) unsubSignal();
    if (pc) { pc.close(); pc = null; }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    callStatus.textContent = reason || 'Call ended';
    setTimeout(closeModal, 1500);
    await setDoc(callRef, { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
    if (state.activeCallCleanup) state.activeCallCleanup = null;
  }

  hangupBtn.onclick = () => cleanup('You hung up.');
  if (endSwapBtn) endSwapBtn.onclick = async () => {
    if (swapId) await finalizeSwap(swapId);
    await cleanup('Swap completed!');
  };

  async function setupPeerConnection() {
    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidatesCol = collection(callRef, isCaller ? 'callerCandidates' : 'calleeCandidates');
        await addDoc(candidatesCol, JSON.parse(JSON.stringify(event.candidate)));
      }
    };
    pc.ontrack = (event) => {
      if (remoteVideo.srcObject !== event.streams[0]) remoteVideo.srcObject = event.streams[0];
    };
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      localVideo.srcObject = localStream;
    } catch (e) {
      callStatus.textContent = 'Could not get camera/mic: ' + e.message;
      return;
    }
  }

  (async () => {
    await setupPeerConnection();
    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await setDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });
    }

    unsubSignal = onSnapshot(callRef, async (snap) => {
      const data = snap.data();
      if (!data) return;
      if (!isCaller && data.offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await setDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });
      }
      if (data.answer && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
      if (data.status === 'ended') cleanup('Remote hung up.');
    });

    const callerCandidatesCol = collection(callRef, 'callerCandidates');
    const calleeCandidatesCol = collection(callRef, 'calleeCandidates');
    onSnapshot(isCaller ? calleeCandidatesCol : callerCandidatesCol, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate).catch(() => {});
        }
      });
    });
  })();

  state.activeCallCleanup = cleanup;
}
