package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"os"
	"regexp"
	"sync"
	"unsafe"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v2"
)

var (
	signalingURL     = "localhost:8080"
	stunturnURL      = "localhost:3478"
	serverUname      = "username"
	serverCredential = "credential"

	videoTrack     *webrtc.Track
	audioTrack     *webrtc.Track
	videoTrackLock = &sync.RWMutex{}
	audioTrackLock = &sync.RWMutex{}

	isConnected bool
)

var mu sync.Mutex

func streaming(done <-chan interface{}, vehicleID string) {
	signalingURLEnv := os.Getenv("SIGNALING_URL")
	stunturnURLEnv := os.Getenv("STUN_TURN_URL")
	userCredEnv := os.Getenv("USER_CREDENTIAL")

	if signalingURLEnv != "" {
		signalingURL = signalingURLEnv
	}
	if stunturnURLEnv != "" {
		stunturnURL = stunturnURLEnv
	}
	if userCredEnv == "" {
		userCredEnv = serverUname + "=" + serverCredential
	}

	kv := regexp.MustCompile(`(\w+)=(\w+)`).FindStringSubmatch(userCredEnv)
	serverUname = kv[1]
	serverCredential = kv[2]

	log.Println(signalingURL)
	log.Println(stunturnURLEnv)
	log.Println(serverUname)
	log.Println(serverCredential)

	// signalingサーバに接続
	ws, _, err := websocket.DefaultDialer.Dial("wss://"+signalingURL+"/streaming/publish", nil)
	if err != nil {
		log.Fatal("websocket client connection error:", err)
	}
	defer ws.Close()

	// registerメッセージを送信
	register := SignalingMessage{
		Type:      "register",
		VehicleID: vehicleID,
	}
	log.Println(register.Type)
	log.Println(register.VehicleID)
	jsonReg, _ := json.Marshal(register)
	err = ws.WriteMessage(websocket.TextMessage, jsonReg)
	if err != nil {
		log.Fatal("register send error:", err)
	}

	// ICE
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{"stun:" + stunturnURL},
			},
			{
				URLs:           []string{"turn:" + stunturnURL},
				Credential:     serverCredential,
				CredentialType: webrtc.ICECredentialTypePassword,
				Username:       serverUname,
			},
		},
	})
	if err != nil {
		log.Fatal("ICE error:", err)
	}
	defer peerConnection.Close()

	audioTrackLock.Lock()
	audioTrack, err = peerConnection.NewTrack(webrtc.DefaultPayloadTypeOpus, rand.Uint32(), "audio", "pion1")
	if err != nil {
		log.Fatal("media track audio error:", err)
	}
	if _, err = peerConnection.AddTrack(audioTrack); err != nil {
		log.Fatal("media track audio error:", err)
	}
	audioTrackLock.Unlock()

	videoTrackLock.Lock()
	videoTrack, err = peerConnection.NewTrack(webrtc.DefaultPayloadTypeVP8, rand.Uint32(), "video", "pion2")
	if err != nil {
		log.Fatal("media track video error:", err)
	}
	if _, err = peerConnection.AddTrack(videoTrack); err != nil {
		log.Fatal("media track video error:", err)
	}
	videoTrackLock.Unlock()

	// offerメッセージを送信
	offer, err := peerConnection.CreateOffer(nil)
	if err != nil {
		log.Fatal("offer create error:", err)
	}
	peerConnection.SetLocalDescription(offer)

	mu.Lock()
	log.Println(offer.Type)
	log.Println(offer.SDP)
	err = ws.WriteMessage(websocket.TextMessage, []byte(offer.SDP))
	mu.Unlock()
	if err != nil {
		log.Fatal("offer send error:", err)
	}

	// ICE接続状態イベントハンドリング
	peerConnection.OnICEConnectionStateChange(func(connectionState webrtc.ICEConnectionState) {
		log.Printf("Connection State has changed %s \n", connectionState.String())

		// 接続完了時イベント
		if connectionState == webrtc.ICEConnectionStateConnected {
			isConnected = true
		}
	})

	// answerメッセージを受信するまで待機
	go func() {
		mu.Lock()
		defer mu.Unlock()
		_, ansOffStr, err := ws.ReadMessage()
		if err != nil {
			log.Fatal("answer receive error:", err)
		}

		sdpType := webrtc.SDPTypeAnswer
		sdpType.UnmarshalJSON(ansOffStr)

		ansOffSD := webrtc.SessionDescription{
			Type: sdpType,
			SDP:  *(*string)(unsafe.Pointer(&ansOffStr)),
		}

		log.Println(ansOffSD.Type)
		log.Println(ansOffSD.SDP)

		if err = peerConnection.SetRemoteDescription(ansOffSD); err != nil {
			log.Fatal("answer set error:", err)
		}
	}()

	<-done

	videoTrackLock.Lock()
	videoTrack = nil
	videoTrackLock.Unlock()

	audioTrackLock.Lock()
	audioTrack = nil
	audioTrackLock.Unlock()

	isConnected = false

	// byeメッセージを送信
	bye := SignalingMessage{
		Type:      "bye",
		VehicleID: vehicleID,
	}
	log.Println(bye.Type)
	log.Println(bye.VehicleID)
	jsonBye, _ := json.Marshal(bye)
	err = ws.WriteMessage(websocket.TextMessage, jsonBye)
	if err != nil {
		log.Fatal("bye send error:", err)
	}
}
