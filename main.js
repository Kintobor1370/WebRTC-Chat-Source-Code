import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import config from './firebaseConfig.json' with { type: 'json' }

// Import firebase configuration parameters
const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    // STUN
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },

    // TURN 
    {
      urls: [
        'turn:turn.yourdomain.com:3478?transport=udp',
        'turn:turn.yourdomain.com:3478?transport=tcp'
      ],
      username: 'user',
      credential: 'pass'
    },
  ],
  iceCandidatePoolSize: 10,
};

// Peer connection
let pc = new RTCPeerConnection(servers);

// Detect mobile device
const isMobileByWidth = window.matchMedia('(max-width: 768px)').matches;

// Streams
let localStream = null;
let remoteStream = null;
let placeholderStream = null;
let micStream = null;
let screenStream = null;
let audioSender = null;
let videoSender = null;

// Tracks
let camTrack = null;
let micTrack = null;
let placeholderVideoTrack = null;
let placeholderAudioTrack = null;
let shrVideoTrack = null;
let shrAudioTrack = null;
let mixedAudioTrack = null;

// HTML elements
const placeholder =  document.getElementById('placeholder');
const camButton =    document.getElementById('camButton');
const micButton =    document.getElementById('micButton');
const shrButton =    document.getElementById('shrButton');
const localVideo =   document.getElementById('localVideo');
const callButton =   document.getElementById('callButton');
const copyButton =   document.getElementById('copyButton');
const callStatus =   document.getElementById('callStatus');
const callInput =    document.getElementById('callInput');
const joinButton =   document.getElementById('joinButton');
const remoteVideo =  document.getElementById('remoteVideo');
const endButton =    document.getElementById('endButton');
const iconCam =      document.getElementById('iconCam');
const iconMic =      document.getElementById('iconMic');
const iconShr =      document.getElementById('iconShr');
const idDisplay =    document.getElementById('idDisplay');
const answerStatus = document.getElementById('answerStatus');

// Button text elements
const enMsg =  "Enable ";
const disMsg = "Disable ";
const camMsg = "Camera";
const micMsg = "Microphone";
const shrMsg = "Screen Sharing";

// Assets
const iconCamEnabled = 'assets/material-symbols--video-camera-front.svg';
const iconCamDisabled = 'assets/material-symbols--video-camera-front-off.svg';
const iconMicEnabled = 'assets/material-symbols--mic.svg';
const iconMicDisabled = 'assets/material-symbols--mic-off.svg';
const iconShrEnabled = 'assets/material-symbols--mimo-outline.svg';
const iconShrDisabled = 'assets/material-symbols--mimo-disconnect-outline.svg';

// Indicators
let enableCam = false;
let enableMic = false;
let enableShr = false;
let listenTriggered = false;

// Call ID
let callId = null;

// Noise cancellation configurations
const noiseCancelConfig = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true
};

// Listener for an empty call ID input
callInput.addEventListener('input', (event) => {
  // Reset the answer status after a change to call ID input
  answerStatus.innerHTML = '';

  let inputValue = event.target.value;
  joinButton.disabled = inputValue.trim() === '';
});

// Create placeholder audio
const placeholderAudioStream = getPlaceholderAudioStream();
placeholderAudioTrack = placeholderAudioStream.getAudioTracks()[0];

// Create placeholder image
const canvas = document.createElement('canvas');
canvas.width = remoteVideo.offsetWidth;
canvas.height = remoteVideo.offsetHeight;

// Placeholder image load handler
placeholder.onload = () => {
  console.log('Placeholder image load started');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(placeholder, 0, 0, canvas.width, canvas.height);
  placeholderStream = canvas.captureStream(30);
  placeholderVideoTrack = placeholderStream.getVideoTracks()[0];
  initializePeerConnectionSettings();
  console.log('Placeholder image load done');
}
// Load image AFTER defining the onload handler
placeholder.src = 'assets/Tenna_screenshot_Technical_Difficulties.jpg';


// 1. Camera button press
camButton.onclick = async () => {
  if (!enableCam) {
    // If enabling camera:
    // Create camera video track
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    camTrack = camStream.getVideoTracks()[0];
    
    // Update the peer connection with camera track
    if (videoSender === null) {
      console.log('ADD VIDEO TRACK');
      videoSender = pc.addTrack(camTrack, camStream);
    }
    else {
      console.log('REPLACE VIDEO TRACK');
      videoSender.replaceTrack(camTrack);
    }
  }
  else {
    // If disabling camera:
    // Replace camera video track with placeholder
    console.log('PLACEHODLER VIDEO TRACK');
    videoSender.replaceTrack(placeholderVideoTrack);
  }
  // Confirm camera connectivity
  enableCam = !enableCam;
  enableShr = false;
  console.log('Camera: ', enableCam ? 'ON' : 'OFF');
  
  updateVideoElements();
  updateButtons();
  testAudioVideo();
};


// 2. Microphone button press
micButton.onclick = async () => {
  if (!enableMic) {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: noiseCancelConfig });
    micTrack = micStream.getAudioTracks()[0];
    
    // Screen sharing enabled => mix audio tracks
    // Else use microphone audio track only
    const audioStream = enableShr ? getMixedAudioStream() : micStream;
    const audioTrack = audioStream.getTracks()[0];
    if (audioSender === null) {
      audioSender = pc.addTrack(audioTrack, audioStream);
    }
    else {
      audioSender.replaceTrack(audioTrack);
    }
  }
  else {
    if (enableShr) {
      // Screen sharing still enabled => leave screen audio track
      audioSender.replaceTrack(shrAudioTrack);
    }
    else {
      // Microphone and screen sharing disabled => replace audio track with a placeholder
      audioSender.replaceTrack(placeholderAudioTrack);
    }
  }
  enableMic = !enableMic;
  console.log('Microphone: ', enableMic ? 'ON' : 'OFF');
  
  updateVideoElements();
  updateButtons();
  testAudioVideo();
};


// 3. Screen sharing button press
shrButton.onclick = async () => {
  if (!enableShr) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true,
      audio: true
    });

    shrVideoTrack = screenStream.getVideoTracks()[0];

    // null is added in case getDisplayMedia does not return audio
    // e.g.: the user enables video streaming only
    shrAudioTrack = screenStream.getAudioTracks()[0] || null;
    
    // Add video track to peer connection
    videoSender.replaceTrack(shrVideoTrack);
    
    let mixedAudioStream = null;
    if (enableMic && shrAudioTrack) {
      // Microphone enabled; Display audio track is present:
      // Mix microphone audio with display audio
      mixedAudioStream = getMixedAudioStream();
      mixedAudioTrack = mixedAudioStream.getAudioTracks()[0];
      
      if (audioSender === null) {
        audioSender = pc.addTrack(mixedAudioTrack, mixedAudioStream);
      } else {
        await audioSender.replaceTrack(mixedAudioTrack);
      }
    } else if (shrAudioTrack) {
      // Microphone disabled; Display track is present:
      // Replace current audio track with display audio only
      if (audioSender === null) {
        audioSender = pc.addTrack(shrAudioTrack, screenStream);
      } else {
        await audioSender.replaceTrack(shrAudioTrack);
      }
    }
  }
  else {
    videoSender.replaceTrack(placeholderVideoTrack);
    if (enableMic) {
      // Microphone still enabled => leave microphone audio track
      audioSender.replaceTrack(micTrack);
    }
    else {
      // Microphone and screen sharing disabled => replace audio track with a placeholder
      audioSender.replaceTrack(placeholderAudioTrack);
    }
  }

  // Confirm screen sharing
  enableShr = !enableShr;
  enableCam = false;
  console.log('Screen sharing: ', enableShr ? 'ON' : 'OFF');

  updateVideoElements();
  updateButtons();
  testAudioVideo();
};


// 4. Create an offer
callButton.onclick = async () => {
  disableButtons();
  idDisplay.innerHTML = 'Creating call...';
  
  // Reference Firestore collections for signaling
  // When document does not have an ID, Firestore creates one automatically
  const callDoc = firestore.collection('calls').doc();
  callId = callDoc.id;
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    type: offerDescription.type,
    sdp: offerDescription.sdp
  };

  await callDoc.set({ offer });
  console.log('Offer added');
  const localVideoTracks = pc.getSenders().length;
  console.log('Offer sent. ', localVideoTracks, ' local video tracks');

  // Enable copy button
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(callId);
      console.log('Call ID copied.');
      callStatus.innerHTML = 'Call ID copied.';
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }
  copyButton.hidden = false;

  // Display call ID
  idDisplay.innerHTML = 'Your call ID: ' + callId;
  enableButtons();
  callButton.disabled = true;
  joinButton.disabled = true;

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
        //callStatus.innerHTML = 'Connection established!';
      }
    });
  });

  // Listen for end of the call
  callDoc.onSnapshot((doc) => {
    if (!doc.exists) {
      endCall();
      idDisplay.innerHTML = 'Other user has ended the call.';
    }
  });
};


// 5. Join the call with the unique ID
joinButton.onclick = async () => {
  disableButtons();
  const inputId = callInput.value;
  
  // If the offer sender tries to answer their own offer
  if (inputId === callId) {
    answerStatus.innerHTML = 'You are already connected to this call.';
    enableButtons();
    return;
  }

  const callDoc = firestore.collection('calls').doc(inputId);

  const snapshot = await callDoc.get();
  // if the offer was not created yet
  if (!snapshot.exists) {
    // Display the notification
    answerStatus.innerHTML = 'Sorry, this call does not exist. Please try a different ID.';
    enableButtons();
    return;
  }

  const data = snapshot.data();
  for (const [key, value] of Object.entries(data)) {
    // if another user has already answered the call:
    if (key === 'answer') {
      // Display the notification
      answerStatus.innerHTML = 'Sorry, another user has already answered this call. Please try a different ID.';
      enableButtons();
      return;
    }
  }
  callStatus.innerHTML = 'Call found! Connecting...';

  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  console.log("Offer: ", offerDescription);
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const numRemoteTracks = pc.getReceivers().length;
  console.log('Answer: ', numRemoteTracks, ' remote tracks');

  const answerDescription = await pc.createAnswer();
  console.log('Descriprion: ', answerDescription);
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
        //answerStatus.innerHTML = 'Connection established!';
      }
    });
    if (!listenTriggered) {
      callId = inputId;
      enableButtons();
      callButton.disabled = true;
      joinButton.disabled = true;
      listenTriggered = true;
    }
  });

  // Listen for end of the call
  callDoc.onSnapshot((doc) => {
    if (!doc.exists) {
      endCall();
      idDisplay.innerHTML = 'Other user has ended the call.';
    }
  });
};


// 6. End the call and delete its document from Firestore
endButton.onclick = async () => {
  endCall(true);
}


// End the call (with or without deleting call data)
async function endCall(deleteDoc = false) {
  disableButtons();
  idDisplay.innerHTML = 'Ending call...';

  if (deleteDoc) {
    const callDoc = firestore.collection('calls').doc(callId);
    await callDoc.delete();
    console.log('Call data deleted');
  }
    
  // Close the existing peer connection and create a new instance
  pc.close();
  pc = new RTCPeerConnection(servers);
  initializePeerConnectionSettings();
  updateVideoElements();
  
  idDisplay.innerHTML = '';
  callInput.value = '';
  callStatus.innerHTML = '';
  answerStatus.innerHTML = '';
  console.log('Call ended');
  enableButtons();
}


// Initialize RTC peer connection settings
function initializePeerConnectionSettings() {
  // Reset streams
  remoteStream = new MediaStream();
  micStream = null;
  screenStream = null;

  // Reset tracks
  camTrack = null;
  micTrack = null;
  shrVideoTrack = null;
  shrAudioTrack = null;
  mixedAudioTrack = null;

  // Reset indicators
  enableCam = false;
  enableMic = false;
  enableShr = false;
  listenTriggered = false;

  // Reset call ID
  callId = null;

  // Reset local and remote stream screens
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Hide copy call ID button
  copyButton.hidden = true;

  // Reset senders
  audioSender = pc.addTrack(placeholderAudioTrack, placeholderAudioStream);
  videoSender = pc.addTrack(placeholderVideoTrack, placeholderStream);

  // Pull tracks from peer connection (remote stream), add to video stream
  pc.ontrack = async (event) => {
    // DEBUG
    console.log('Remote track received', {
      kind: event.track.kind,
      id: event.track.id,
      label: event.track.label,
      enabled: event.track.enabled,
      muted: event.track.muted,
      readyState: event.track.readyState,
      streams: event.streams.length
    });

    if (event.streams && event.streams.length > 0) {
      // Add remote tracks to the remote stream
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    }

    // Wait until the track is unmuted before expecting video.
    event.track.onunmute = async () => {
      console.log('REMOTE TRACK UNMUTED:', event.track.kind);
      // Update the remote stream front-end component
      remoteVideo.srcObject = remoteStream;
    };

    event.track.onmute = () => {
      console.log('REMOTE TRACK MUTED:', event.track.kind);
    };

    event.track.onended = () => {
      console.log('REMOTE TRACK ENDED:', event.track.kind);
    };
  };

  // ICE connection status
  pc.oniceconnectionstatechange = () => {
    console.log('ICE CONNECTION:', pc.iceConnectionState);

    if (pc.iceConnectionState === 'checking') {
      callStatus.innerHTML = 'Checking candidates...';
      console.log('ICE connection checking');
    }

    if (pc.iceConnectionState === 'failed') {
      callStatus.innerHTML = 'Connection failed!';
      console.error('ICE connection failed');
    }

    if (pc.iceConnectionState === 'disconnected') {
      callStatus.innerHTML = 'Temporarily disconnected.';
      console.warn('ICE connection temporarily disconnected');
    }

    if (
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    ) {
      console.log('ICE connection established');
    }
  };

  // Peer connection status
  pc.onconnectionstatechange = () => {
    console.log('Peer connection:', pc.connectionState);

    if (pc.connectionState === 'connected') {
      callStatus.innerHTML = 'Connection established!';
      console.log('Peer connection established');
    }

    if (pc.connectionState === 'failed') {
      callStatus.innerHTML = 'Connection failed!';
      console.error('Peer connection failed');
    }
  };

  updateButtons();
  testAudioVideo();
}


// Create placeholder audio
function getPlaceholderAudioStream() {
  const audioContext = new AudioContext();
  const osc = audioContext.createOscillator();
  osc.frequency.value = 0;  // silent
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0; // zero volume
  osc.connect(gainNode);
  const audioStreamDestination = audioContext.createMediaStreamDestination();
  osc.connect(audioStreamDestination);
  osc.start();

  return audioStreamDestination.stream;
}


// Mix audio from microphone and screen sharing into a new audio stream
function getMixedAudioStream() {
  // Initialise web audio API
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  // Connect microphone audio to the mixer
  const micSource = audioContext.createMediaStreamSource(micStream);
  micSource.connect(destination);

  // Connect display audio to the mixer
  const displayAudioSource = audioContext.createMediaStreamSource(screenStream);
  displayAudioSource.connect(destination);

  // Return audio stream from the mixer
  return destination.stream;
}

// Update front-end video elements
async function updateVideoElements() {
  // Push tracks from the active stream (camera / screen / placeholder) to local stream
  localStream = new MediaStream();
  if (enableCam) {
    localStream.addTrack(camTrack);
  }
  else if (enableShr) {
    localStream.addTrack(shrVideoTrack); 
  }
  else {
    localStream.addTrack(placeholderVideoTrack);
  }

  // Update the frontend component
  localVideo.srcObject = localStream;
}

// Update button availability
function updateButtons() {
  // Update button text
  camButton.innerHTML = enableCam ? disMsg + camMsg : enMsg + camMsg;
  micButton.innerHTML = enableMic ? disMsg + micMsg : enMsg + micMsg;
  shrButton.innerHTML = enableShr ? disMsg + shrMsg : enMsg + shrMsg;

  // Update icons
  iconCam.src = enableCam ? iconCamEnabled : iconCamDisabled;
  iconMic.src = enableMic ? iconMicEnabled : iconMicDisabled;
  iconShr.src = enableShr ? iconShrEnabled : iconShrDisabled;
}

// Enable buttons
function enableButtons() {
  camButton.disabled =  false; 
  micButton.disabled =  false;
  shrButton.disabled =  false;
  callButton.disabled = false;
  joinButton.disabled = callInput.value.trim() === '';
  endButton.disabled =  callId === null;
}

// Disable buttons
function disableButtons() {
  camButton.disabled =  true;
  micButton.disabled =  true;
  shrButton.disabled =  true;
  callButton.disabled = true;
  joinButton.disabled = true;
  endButton.disabled =  true;
}

// Test audio and video streams
function testAudioVideo() {
  // Local audio/video status
  const hasLocalAudio = pc.getSenders().some(s => s.track?.kind === 'audio');
  const hasLocalVideo = pc.getSenders().some(s => s.track?.kind === 'video');

  // Remote audio/video status
  const hasRemoteAudio = pc.getReceivers().some(r => r.track?.kind === 'audio');
  const hasRemoteVideo = pc.getReceivers().some(r => r.track?.kind === 'video');

  console.log('LOCAL: audio: ', hasLocalAudio, '; video: ', hasLocalVideo);
  console.log('REMOTE: audio: ', hasRemoteAudio, '; video: ', hasRemoteVideo);
}