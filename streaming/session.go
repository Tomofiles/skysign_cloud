package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"

	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v2"
)

var (
	stunturnURL      = "localhost:3478"
	serverUname      = "username"
	serverCredential = "credential"

	m webrtc.MediaEngine

	api *webrtc.API

	upgrader = websocket.Upgrader{}

	sessionList = sync.Map{}
)

const (
	rtcpPLIInterval = time.Second * 3
)

func getServerInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		payload := ServerInfo{
			URL:        stunturnURL,
			Credential: serverCredential,
			Username:   serverUname,
		}
		response, _ := json.Marshal(payload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write(response)
	}
}

func publish(w http.ResponseWriter, r *http.Request) {

	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal("websocket upgrade error:", err)
	}
	defer c.Close()

	// registerメッセージを受信するまで待機
	_, msg, err := c.ReadMessage()
	if err != nil {
		log.Fatal("register receive error:", err)
	}

	register := SignalingMessage{}
	err = json.Unmarshal(msg, &register)
	if err != nil {
		log.Fatal("register unmarshal error:", err)
	}

	log.Println(register.Type)
	log.Println(register.VehicleID + "\n")

	var sessionItem *SessionItem
	sessionItem = &SessionItem{
		VideoTrackLock: &sync.RWMutex{},
		AudioTrackLock: &sync.RWMutex{},
	}
	sessionList.Store(register.VehicleID, sessionItem)

	// offerメッセージを受信するまで待機
	mt, msg, err := c.ReadMessage()
	if err != nil {
		log.Fatal("offer receive error:", err)
	}

	// ICE
	pubReceiver, err := api.NewPeerConnection(webrtc.Configuration{
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
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlanWithFallback,
	})
	if err != nil {
		log.Fatal("ICE error:", err)
	}
	defer pubReceiver.Close()

	_, err = pubReceiver.AddTransceiver(webrtc.RTPCodecTypeAudio)
	if err != nil {
		log.Fatal("media track audio error:", err)
	}

	_, err = pubReceiver.AddTransceiver(webrtc.RTPCodecTypeVideo)
	if err != nil {
		log.Fatal("media track video error:", err)
	}

	// media trackのイベントハンドリング
	pubReceiver.OnTrack(func(remoteTrack *webrtc.Track, receiver *webrtc.RTPReceiver) {
		if remoteTrack.PayloadType() == webrtc.DefaultPayloadTypeVP8 {

			var err error
			sessionItem.VideoTrackLock.Lock()
			sessionItem.VideoTrack, err = pubReceiver.NewTrack(remoteTrack.PayloadType(), remoteTrack.SSRC(), "video", "pion")
			sessionItem.VideoTrackLock.Unlock()
			if err != nil {
				log.Fatal("video track create error:", err)
			}

			rtpBuf := make([]byte, 1400)
			for {
				i, err := remoteTrack.Read(rtpBuf)
				if err != nil {
					log.Println("remote track eof")
					break
				}
				sessionItem.VideoTrackLock.RLock()
				_, err = sessionItem.VideoTrack.Write(rtpBuf[:i])
				sessionItem.VideoTrackLock.RUnlock()
				if err != nil && err != io.ErrClosedPipe {
					log.Fatal("video track closed error:", err)
				}
			}

		} else if remoteTrack.PayloadType() == webrtc.DefaultPayloadTypeOpus {

			var err error
			sessionItem.AudioTrackLock.Lock()
			sessionItem.AudioTrack, err = pubReceiver.NewTrack(remoteTrack.PayloadType(), remoteTrack.SSRC(), "audio", "pion")
			sessionItem.AudioTrackLock.Unlock()
			if err != nil {
				log.Fatal("audio track create error:", err)
			}

			rtpBuf := make([]byte, 1400)
			for {
				i, err := remoteTrack.Read(rtpBuf)
				if err != nil {
					log.Println("remote track eof")
					break
				}
				sessionItem.AudioTrackLock.RLock()
				_, err = sessionItem.AudioTrack.Write(rtpBuf[:i])
				sessionItem.AudioTrackLock.RUnlock()
				if err != nil && err != io.ErrClosedPipe {
					log.Fatal("audio track closed error:", err)
				}
			}
		}
	})

	log.Println("offer")
	log.Println(string(msg) + "\n")

	pubReceiver.SetRemoteDescription(
		webrtc.SessionDescription{
			SDP:  string(msg),
			Type: webrtc.SDPTypeOffer,
		},
	)

	// answerメッセージを返却
	answer, err := pubReceiver.CreateAnswer(nil)
	if err != nil {
		log.Fatal("answer create error:", err)
	}

	pubReceiver.SetLocalDescription(answer)

	log.Println("answer")
	log.Println(answer.SDP + "\n")

	err = c.WriteMessage(mt, []byte(answer.SDP))
	if err != nil {
		log.Fatal("answer send error:", err)
	}

	// byeメッセージを受信するまで待機
	_, msg, err = c.ReadMessage()
	if err != nil {
		log.Fatal("bye receive error:", err)
	}

	bye := SignalingMessage{}
	err = json.Unmarshal(msg, &bye)
	if err != nil {
		log.Fatal("bye unmarshal error:", err)
	}

	log.Println(bye.Type)
	log.Println(bye.VehicleID + "\n")

	sessionList.Delete(bye.VehicleID)
}

func subscribe(w http.ResponseWriter, r *http.Request) {

	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal("websocket upgrade error:", err)
	}
	defer c.Close()

	// registerメッセージを受信するまで待機
	var sessionItem *SessionItem
	_, msg, err := c.ReadMessage()
	if err != nil {
		log.Fatal("register receive error:", err)
	}

	register := SignalingMessage{}
	err = json.Unmarshal(msg, &register)
	if err != nil {
		log.Fatal("register unmarshal error:", err)
	}

	log.Println(register.Type)
	log.Println(register.VehicleID + "\n")

	loadValue, ok := sessionList.Load(register.VehicleID)
	sessionItem, _ = loadValue.(*SessionItem)

	// acceptメッセージを返却
	result := "OK"
	if !ok {
		result = "NG"
	}

	accept := SignalingMessage{
		Type:      "accept",
		VehicleID: register.VehicleID,
		Result:    result,
	}

	log.Println(accept.Type)
	log.Println(accept.VehicleID)
	log.Println(accept.Result + "\n")

	jsonAc, err := json.Marshal(accept)
	if err != nil {
		log.Fatal("accept marshal error:", err)
	}
	err = c.WriteMessage(websocket.TextMessage, jsonAc)
	if err != nil {
		log.Fatal("accept send error:", err)
	}

	if !ok {
		log.Println("session not found")
		return
	}

	// offerメッセージを受信するまで待機
	mt, msg, err := c.ReadMessage()
	if err != nil {
		log.Fatal("offer receive error:", err)
	}

	// ICE
	subSender, err := api.NewPeerConnection(webrtc.Configuration{
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
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlanWithFallback,
	})
	if err != nil {
		log.Fatal("ICE error:", err)
	}
	defer subSender.Close()

	for {
		sessionItem.VideoTrackLock.RLock()
		if sessionItem.VideoTrack == nil {
			sessionItem.VideoTrackLock.RUnlock()
			time.Sleep(100 * time.Millisecond)
		} else {
			sessionItem.VideoTrackLock.RUnlock()
			break
		}
	}

	// media trackの設定
	sessionItem.VideoTrackLock.RLock()
	_, err = subSender.AddTrack(sessionItem.VideoTrack)
	sessionItem.VideoTrackLock.RUnlock()
	if err != nil {
		log.Fatal("media track video error:", err)
	}

	sessionItem.AudioTrackLock.RLock()
	_, err = subSender.AddTrack(sessionItem.AudioTrack)
	sessionItem.AudioTrackLock.RUnlock()
	if err != nil {
		log.Fatal("media track audio error:", err)
	}

	log.Println("offer")
	log.Println(string(msg) + "\n")

	subSender.SetRemoteDescription(
		webrtc.SessionDescription{
			SDP:  string(msg),
			Type: webrtc.SDPTypeOffer,
		},
	)

	// answerメッセージを返却
	answer, err := subSender.CreateAnswer(nil)
	if err != nil {
		log.Fatal("answer create error:", err)
	}

	subSender.SetLocalDescription(answer)

	log.Println("answer")
	log.Println(answer.SDP + "\n")

	err = c.WriteMessage(mt, []byte(answer.SDP))
	if err != nil {
		log.Fatal("answer send error:", err)
	}

	// byeメッセージを受信するまで待機
	_, msg, err = c.ReadMessage()
	if err != nil {
		log.Fatal("bye receive error:", err)
	}

	bye := SignalingMessage{}
	err = json.Unmarshal(msg, &bye)
	if err != nil {
		log.Fatal("bye unmarshal error:", err)
	}

	log.Println(bye.Type)
	log.Println(bye.VehicleID + "\n")
}
