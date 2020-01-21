package main

import (
	"log"
	"os"
	"os/signal"
	"sync"
	"time"

	"golang.org/x/net/websocket"
	"google.golang.org/grpc"
)

var (
	mavsdk = "localhost:50051"
	origin = "http://localhost:8080/"
	wsurl  = "ws://localhost:8080/edge/telemetry"
)

var rwm sync.RWMutex

func main() {
	mavsdkAddressEnv := os.Getenv("MAVSDK_ADDRESS")
	cloudAddressHTTPEnv := os.Getenv("CLOUD_ADDRESS_HTTP")
	cloudAddressWsEnv := os.Getenv("CLOUD_ADDRESS_WS")

	if mavsdkAddressEnv != "" {
		mavsdk = mavsdkAddressEnv
	}
	if cloudAddressHTTPEnv != "" {
		origin = cloudAddressHTTPEnv
	}
	if cloudAddressWsEnv != "" {
		wsurl = cloudAddressWsEnv
	}

	gr, err := grpc.Dial(mavsdk, grpc.WithInsecure())
	if err != nil {
		log.Fatal("grpc client connection error:", err)
	}
	defer gr.Close()

	ws, err := websocket.Dial(wsurl, "", origin)
	if err != nil {
		log.Fatal("websocket client connection error:", err)
	}
	defer ws.Close()

	mavlink := NewMavlink(ws, gr)
	mavlink.Listen()

	go mavlink.SendTelemetry()

	stop := make(chan os.Signal)
	signal.Notify(stop, os.Interrupt)

	<-stop

	time.Sleep(1 * time.Second)

	defer log.Printf("Skysign Edge end.")
}
