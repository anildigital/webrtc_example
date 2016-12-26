var localVideo;
var remoteVideo;
var peerConnection;
var uuid;

import {Socket} from "phoenix"

var WebRTC = (function () {

    var peerConnectionConfig = {
        'iceServers': [
            {'urls': 'stun:stun.services.mozilla.com'},
            {'urls': 'stun:stun.l.google.com:19302'},
        ]
    };

    var channel;

    var joinServer = function() {
        let socket = new Socket("/socket", {params: {token: window.userToken}})
        socket.connect()

        channel = socket.channel("videochat:lobby", {})
        channel.join()
                            .receive("ok", resp => { console.log("Joined successfully", resp) })
                            .receive("error", resp => { console.log("Unable to join", resp) })

        return channel;
    }

    var init = function() {
        uuid = uuid();

        var channel = joinServer();


        localVideo = document.getElementById('localVideo');
        remoteVideo = document.getElementById('remoteVideo');

        channel.on("data", gotMessageFromServer)

        var constraints = {
            video: true,
            audio: true,
        };

        if(navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices
                     .getUserMedia(constraints)
                     .then(getUserMediaSuccess)
                     .catch(errorHandler);
        } else {
            alert('Your browser does not support getUserMedia API');
        }
    }

    function getUserMediaSuccess(stream) {
        window.localStream = stream;
        localVideo.src = window.URL.createObjectURL(stream);
    }

    var start = function(isCaller) {
        peerConnection = new RTCPeerConnection(peerConnectionConfig);
        peerConnection.onicecandidate = gotIceCandidate;
        peerConnection.onaddstream = gotRemoteStream;
        peerConnection
            .addStream(localStream);

        if(isCaller) {
            peerConnection
                .createOffer()
                .then(createdDescription)
                .catch(errorHandler);
        }
    }

    function gotMessageFromServer(message) {
        if(!peerConnection) start(false);

        var signal = JSON.parse(message.body);

        // Ignore messages from ourself
        if(signal.uuid == uuid) return;

        if(signal.sdp) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {
                // Only create answers in response to offers
                if(signal.sdp.type == 'offer') {
                    peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
                }
            }).catch(errorHandler);
        } else if(signal.ice) {
            peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
        }
    }

    function gotIceCandidate(event) {
        if(event.candidate != null) {
            channel.push("data", {body: JSON.stringify({'ice': event.candidate, 'uuid': uuid})})
        }
    }

    function createdDescription(description) {
        console.log('got description');

        peerConnection.setLocalDescription(description).then(function() {
            channel.push("data", {body: JSON.stringify({'sdp': peerConnection.localDescription, 'uuid': uuid})})
        }).catch(errorHandler);
    }

    function gotRemoteStream(event) {
        console.log('got remote stream');
        remoteVideo.src = window.URL.createObjectURL(event.stream);
    }

    function errorHandler(error) {
        console.log(error);
    }

    // Taken from http://stackoverflow.com/a/105074/515584
    // Strictly speaking, it's not a real UUID, but it gets the job done here
    function uuid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }

        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    return {
        init: init,
        start: start
    }
})

export default WebRTC
