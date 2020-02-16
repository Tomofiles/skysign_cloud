function streamingStart(elementName, vehicleID) {
    let sock = null;
    let wsuri = "wss://" + location.host + "/streaming/subscribe";
    let serverinfo = null;
    let pc = null;

    connectSignaling = function() {
        sock = new WebSocket(wsuri);
        sock.onopen = function() {
            console.log("websocket connected to " + wsuri);
            sock.send(JSON.stringify({type: "register", vehicleID: vehicleID}));
        }
        sock.onclose = function(e) {
            console.log("websocket connection closed (" + e.code + ")");
        }
        sock.onmessage = function(e) {
            console.log("websocket message received: " + e.data);
            
            try {
                let sigMes = JSON.parse(e.data);
                if (sigMes.type === "accept" && sigMes.result === "OK") {
                    getServerInfo()
                } else {
                    displayMessage(vehicleID + ' has not published video streaming.');
                }
            } catch(ex) {
                console.log("startSession");
                try {
                    pc.setRemoteDescription(new RTCSessionDescription({type:'answer', sdp:e.data}))
                } catch (ex) {
                    alert(ex)
                }
            }
        }
        sock.onerror = function(e) {
            console.log("websocket error: " + e.data);
        }
    };
    
    getServerInfo = function() {
        $.ajax('/streaming/serverinfo',
            {
              type: 'get',
              dataType: 'json'
            }
        )
        .done(function(data) {
            serverinfo = data;
            createSession();
        })
        .fail(function() {
            alert("error");
        });
    }

    createSession = function() {
        pc = new RTCPeerConnection({
            iceServers: [
            {
                urls: "stun:" + serverinfo.url
            },
            {
                urls: "turn:" + serverinfo.url,
                credential: serverinfo.credential, 
                username: serverinfo.username
            }
            ]
        })
        pc.oniceconnectionstatechange = e => console.log(pc.iceConnectionState)
        pc.onicecandidate = event => {
            if (event.candidate === null) {
                sock.send(pc.localDescription.sdp);
                console.log("send sdp to server:==============\n" + pc.localDescription.sdp);
            }
        }
    
        console.log("Subcriber createOffer")
        pc.addTransceiver('audio', {'direction': 'recvonly'})
        pc.addTransceiver('video', {'direction': 'recvonly'})

        pc.createOffer()
            .then(d => pc.setLocalDescription(d))
            .catch(console.log)

        console.log("Subcriber ontrack")
        pc.ontrack = function (event) {
            let el = document.getElementById(elementName)
            el.srcObject = event.streams[0];
            el.autoplay = true;
            el.controls = true;
        }
    }

    connectSignaling();

    return function() {
        sock.send(JSON.stringify({type: "bye", vehicleID: vehicleID}));
    }
}
