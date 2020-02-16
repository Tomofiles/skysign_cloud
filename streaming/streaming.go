package main

import (
	"fmt"
	"net/http"
	"os"
	"regexp"

	"github.com/pion/webrtc/v2"
)

var (
	port = "8080"
)

func init() {
	m = webrtc.MediaEngine{}

	m.RegisterCodec(webrtc.NewRTPVP8Codec(webrtc.DefaultPayloadTypeVP8, 90000))
	m.RegisterCodec(webrtc.NewRTPOpusCodec(webrtc.DefaultPayloadTypeOpus, 48000))

	api = webrtc.NewAPI(webrtc.WithMediaEngine(m))
}

func main() {
	portEnv := os.Getenv("PORT")
	stunturnURLEnv := os.Getenv("STUN_TURN_URL")
	userCredEnv := os.Getenv("USER_CREDENTIAL")

	if portEnv != "" {
		port = portEnv
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

	http.HandleFunc("/streaming/publish", publish)
	http.HandleFunc("/streaming/subscribe", subscribe)

	http.HandleFunc("/streaming/serverinfo", getServerInfo)

	fmt.Println("Web listening :" + port)

	http.ListenAndServe(":"+port, nil)
}
