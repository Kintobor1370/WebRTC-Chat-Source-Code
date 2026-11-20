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
      urls: [
      'stun:yourdomain.com:3478'
      ],
    },
    // TURN
    {
      urls: [
        'turn:yourdomain.com:3478?transport=udp',
        'turn:yourdomain.com:3478?transport=tcp'
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
let localStream       = null;
let remoteStream      = null;
let placeholderStream = null;
let micStream         = null;
let screenStream      = null;

let senderAudioMic = null;
let senderAudioShr = null;
let senderVideo    = null;

// Tracks
let camTrack      = null;
let shrVideoTrack = null;

// HTML elements
const placeholder    = document.getElementById('placeholder');
const camButton      = document.getElementById('camButton');
const micButton      = document.getElementById('micButton');
const shrButton      = document.getElementById('shrButton');
const localVideo     = document.getElementById('localVideo');
const remoteVideo    = document.getElementById('remoteVideo');
const remoteAudioMic = document.getElementById('remoteAudioMic');
const remoteAudioShr = document.getElementById('remoteAudioShr');
const callButton     = document.getElementById('callButton');
const copyButton     = document.getElementById('copyButton');
const callStatus     = document.getElementById('callStatus');
const callInput      = document.getElementById('callInput');
const joinButton     = document.getElementById('joinButton');
const endButton      = document.getElementById('endButton');
const volButton      = document.getElementById('volumeButton');
const volumeDiv      = document.getElementById('volume');
const slidersDiv     = document.getElementById('sliders');
const volSliderMic   = document.getElementById('volumeSliderMic');
const volSliderShr   = document.getElementById('volumeSliderShr');
const iconCam        = document.getElementById('iconCam');
const iconMic        = document.getElementById('iconMic');
const iconShr        = document.getElementById('iconShr');
const idDisplay      = document.getElementById('idDisplay');
const answerStatus   = document.getElementById('answerStatus');

// Button text elements
const enMsg  = ' Enable ';
const disMsg = 'Disable ';
const camMsg = 'camera';
const micMsg = 'microphone';
const shrMsg = 'screen sharing';
const volMsg = 'Adjust volume';
const hidMsg = 'Hide settings';

// Assets
const iconCamEnabled  = 'assets/material-symbols--video-camera-front.svg';
const iconCamDisabled = 'assets/material-symbols--video-camera-front-off.svg';
const iconMicEnabled  = 'assets/material-symbols--mic.svg';
const iconMicDisabled = 'assets/material-symbols--mic-off.svg';
const iconShrEnabled  = 'assets/material-symbols--mimo-outline.svg';
const iconShrDisabled = 'assets/material-symbols--mimo-disconnect-outline.svg';

// Indicators
let enableCam = false;
let enableMic = false;
let enableShr = false;

// Call ID
let callId = null;

// Noise cancellation configurations
const noiseCancelConfig = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl:  true
};

// Audio adjusments configurations
const audioContext = new AudioContext();
const nodeMic = audioContext.createGain();
const nodeShr = audioContext.createGain();

let srcMic = null;
let srcShr = null;

let placeholderAudioTrack = null;

// Default volume slider value
const sliderDefaultValue = 1;

// Set GainNode values to default volume slider values
nodeMic.gain.value = sliderDefaultValue;
nodeShr.gain.value = sliderDefaultValue;

nodeMic.connect(audioContext.destination);
nodeShr.connect(audioContext.destination);

// Event listener for the microphone volume slider adjustment
volSliderMic.addEventListener('input', () => {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  nodeMic.gain.value = volSliderMic.value;
});

// Event listener for the screen sharing volume slider adjustment
volSliderShr.addEventListener('input', () => {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  nodeShr.gain.value = volSliderShr.value;
});

// Event listener to detect an empty call ID input
callInput.addEventListener('input', (event) => {
  // Reset the answer status after a change to call ID input
  answerStatus.innerHTML = '';

  let inputValue = event.target.value;
  joinButton.disabled = inputValue.trim() === '' || callId !== null;
});

// Create placeholder image
const canvas = document.createElement('canvas');
canvas.width = remoteVideo.offsetWidth;
canvas.height = remoteVideo.offsetHeight;

// Placeholder video track
let placeholderVideoTrack = null;

// Placeholder image load handler
placeholder.onload = () => {
  console.log('Placeholder image load started');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(placeholder, 0, 0, canvas.width, canvas.height);
  
  // Refresh the canvas to prevent the video track from muting
  setInterval(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(placeholder, 0, 0, canvas.width, canvas.height);
  }, 500);

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
    senderVideo.replaceTrack(camTrack);
  }
  else {
    // If disabling camera:
    // Replace camera video track with placeholder
    console.log('PLACEHODLER VIDEO TRACK');
    senderVideo.replaceTrack(placeholderVideoTrack);
  }
  // Confirm camera connectivity
  enableCam = !enableCam;
  enableShr = false;
  console.log('Camera:', enableCam ? 'ON' : 'OFF');
  
  updateVideoElements();
  updateButtons();
};


// 2. Microphone button press
micButton.onclick = async () => {
  if (!enableMic) {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: noiseCancelConfig });
    
    // Prepare the microphone audio to be added as a separate track
    const micSource = audioContext.createMediaStreamSource(micStream);
    const micNode = audioContext.createGain();
    const micDest = audioContext.createMediaStreamDestination();
    micSource.connect(micNode).connect(micDest);
    
    // Update the peer connection with microphone track
    senderAudioMic.replaceTrack(micDest.stream.getAudioTracks()[0]);
  }
  else {
    senderAudioMic.replaceTrack(placeholderAudioTrack);
  }
  enableMic = !enableMic;
  console.log('Microphone:', enableMic ? 'ON' : 'OFF');
  
  updateVideoElements();
  updateButtons();
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
    const shrAudioTrack =
      screenStream.getAudioTracks()[0] !== null ?
        screenStream.getAudioTracks()[0] :
        placeholderAudioTrack;
    
    // Update peer connection with the screen sharing video track
    senderVideo.replaceTrack(shrVideoTrack);

    // Prepare the screen sharing audio to be added as a separate track
    const shrSource = audioContext.createMediaStreamSource(
      new MediaStream([shrAudioTrack])
    );
    const shrNode = audioContext.createGain();
    const shrDest = audioContext.createMediaStreamDestination();
    shrSource.connect(shrNode).connect(shrDest);
    
    // Update peer connection with the screen sharing audio track
    senderAudioShr.replaceTrack(shrDest.stream.getAudioTracks()[0]);
  }
  else {
    senderVideo.replaceTrack(placeholderVideoTrack);
    senderAudioShr.replaceTrack(placeholderAudioTrack);
  }

  // Confirm screen sharing
  enableShr = !enableShr;
  enableCam = false;
  console.log('Screen sharing:', enableShr ? 'ON' : 'OFF');

  updateVideoElements();
  updateButtons();
};


// 4. Create an offer
callButton.onclick = async () => {
  // Resume audio context on user gesture
  await audioContext.resume();
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
  console.log('Offer sent.', localVideoTracks, 'local video tracks');

  // Enable copy button
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(callId);
      console.log('Call ID copied.');
      callStatus.innerHTML = 'Call ID copied.';
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
  copyButton.hidden = false;

  // Display call ID
  idDisplay.innerHTML = 'Your call ID: ' + callId;
  enableButtons();
  callButton.disabled = true;
  joinButton.disabled = true;

  // Listen for remote answer
  callDoc.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      await pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        await pc.addIceCandidate(candidate);
      }
    });
  });

  // Listen for end of the call
  callDoc.onSnapshot((doc) => {
    if (!doc.exists) {
      endCall();
      idDisplay.innerHTML = '';
      callStatus.innerHTML = 'Other user has ended the call.'
    }
  });
};


// 5. Join the call with the unique ID
joinButton.onclick = async () => {
  // Resume audio context on user gesture
  await audioContext.resume();
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
  console.log('Offer:', offerDescription);
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const numRemoteTracks = pc.getReceivers().length;
  console.log('Answer:', numRemoteTracks, 'remote tracks');

  const answerDescription = await pc.createAnswer();
  console.log('Descriprion:', answerDescription);
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
    callId = inputId;
    endButton.disabled = false;
  });

  // Listen for end of the call
  callDoc.onSnapshot((doc) => {
    if (!doc.exists) {
      endCall();
      idDisplay.innerHTML = '';
      callStatus.innerHTML = 'Other user has ended the call.'
    }
  });
};


// 6. Adjust the user or screen stream volume during the call
volButton.onclick = () => {
  volButton.innerHTML = slidersDiv.hidden ? hidMsg : volMsg;
  slidersDiv.hidden = !slidersDiv.hidden;
}


// 7. End the call and delete its document from Firestore
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
  shrVideoTrack = null;

  // Reset indicators
  enableCam = false;
  enableMic = false;
  enableShr = false;

  // Reset call ID
  callId = null;

  // Reset local and remote stream screens
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Hide copy call ID button
  copyButton.hidden = true;

  // Hide volume sliders
  volumeDiv.hidden = true;
  slidersDiv.hidden = true;

  // Reset volume slider values to the default values
  volSliderMic.value = sliderDefaultValue;
  volSliderShr.value = sliderDefaultValue;

  // Reset GainNode values to default volume slider values
  nodeMic.gain.value = sliderDefaultValue;
  nodeShr.gain.value = sliderDefaultValue;

  // Create placeholder audio
  const placeholderAudioStreamMic = getPlaceholderAudioStream();
  const placeholderAudioStreamShr = getPlaceholderAudioStream();
  placeholderAudioTrack = placeholderAudioStreamMic.getAudioTracks()[0];

  // Reset senders
  senderVideo = pc.addTrack(
    placeholderVideoTrack, 
    placeholderStream
  );

  senderAudioMic = pc.addTrack(
    placeholderAudioStreamMic.getAudioTracks()[0],
    placeholderAudioStreamMic
  );

  senderAudioShr = pc.addTrack(
    placeholderAudioStreamShr.getAudioTracks()[0],
    placeholderAudioStreamShr
  );

  // DEFINE EVENT HANDLERS
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

    const transceivers = pc.getTransceivers();
    
    // Sender order: 0: video, 1: microphone, 2: screen audio
    function getSenderOrder() {
      return transceivers.findIndex(t => t.receiver.track === event.track);
    }

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
      if (event.track.kind === 'video') {
        remoteVideo.srcObject = new MediaStream([event.track]);
        remoteVideo.muted = true;
      }

      if (event.track.kind === 'audio') {
        volumeDiv.hidden = false;
        console.log('Sender order:', getSenderOrder());
        const [element, source, node] = 
          getSenderOrder() === 1 ? 
            [remoteAudioMic, srcMic, nodeMic] :
            [remoteAudioShr, srcShr, nodeShr];
        
        playRemoteAudio(element, event.track, source, node);
      }
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
    console.log('ICE CONNECTION: ', pc.iceConnectionState);

    if (pc.iceConnectionState === 'checking') {
      callStatus.innerHTML = 'Checking candidates...';
    }

    if (pc.iceConnectionState == 'connected') {
      callStatus.innerHTML = 'Candidate found! Connecting...';
    }

    if (pc.iceConnectionState === 'failed') {
      console.error('ICE connection failed');
      callStatus.innerHTML = 'Candidate check failed!';
    }

    if (pc.iceConnectionState === 'disconnected') {
      console.warn('ICE connection temporarily disconnected');
      callStatus.innerHTML = 'Temporarily disconnected...';
    }
  };

  // Peer connection status
  pc.onconnectionstatechange = () => {
    console.log('PEER CONNECTION:', pc.connectionState);

    if (pc.connectionState === 'connected') {
      callStatus.innerHTML = 'Connection established!';
      enableButtons();
      callButton.disabled = true;
      joinButton.disabled = true;
    }

    if (pc.connectionState === 'failed') {
      console.error('Peer connection failed');
      callStatus.innerHTML = 'Connection failed!';
      enableButtons();
      remoteVideo.srcObject = null;
      callButton.disabled = true;
      joinButton.disabled = true;
    }
  };
  updateButtons();
}

// Play a remote audio track
function playRemoteAudio(element, track, src, node) {
  const stream = new MediaStream([track]);

  // Chrome only delivers remote WebRTC audio if the stream is also attached
  element.srcObject = stream;
  
  // Muted to avoid double playback.
  element.muted = true;
  
  element.play().catch(console.error);

  // Disconnect source if previously used
  if (src) {
    src.disconnect();
  }
  src = audioContext.createMediaStreamSource(stream);
  src.connect(node);

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}


// Create placeholder audio
function getPlaceholderAudioStream() {
  const osc = audioContext.createOscillator();
  osc.frequency.value = 0; // silent
  
  // Volume control node
  const nodeZeroVolume = audioContext.createGain();
  nodeZeroVolume.gain.value = 0; // zero volume
  osc.connect(nodeZeroVolume);
  const audioStreamDestination = audioContext.createMediaStreamDestination();
  osc.connect(audioStreamDestination);
  osc.start();

  return audioStreamDestination.stream;
}


// OLD: Mix audio from microphone and screen sharing into a new audio stream
async function getMixedAudioStream() {
  // Initialise web audio API
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
  camButton.disabled  = false; 
  micButton.disabled  = false;
  shrButton.disabled  = false;
  callButton.disabled = false;
  joinButton.disabled = callInput.value.trim() === '' || callId !== null;
  endButton.disabled  = callId === null;
}

// Disable buttons
function disableButtons() {
  camButton.disabled  = true;
  micButton.disabled  = true;
  shrButton.disabled  = true;
  callButton.disabled = true;
  joinButton.disabled = true;
  endButton.disabled  = true;
}