package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"
)

var clients = make(map[chan Telemetry]bool)

var broadcast = make(chan Telemetry)

var upgrader = websocket.Upgrader{}

var edges = make(map[string]*websocket.Conn)

func main() {
	server := &http.Server{Addr: ":8080", Handler: nil}

	fs := http.FileServer(http.Dir("client"))
	http.Handle("/", fs)
	http.HandleFunc("/client/telemetry", sse)
	http.HandleFunc("/client/command", command)
	http.HandleFunc("/edge/telemetry", ws)

	go server.ListenAndServe()

	stop := make(chan os.Signal)
	signal.Notify(stop, os.Interrupt)

	<-stop

	ctxSd, err := context.WithTimeout(context.Background(), 5*time.Second)
	if err != nil {
		log.Printf("error ctx: %v", err)
	}
	server.Shutdown(ctxSd)
}

func sse(w http.ResponseWriter, r *http.Request) {
	flusher, _ := w.(http.Flusher)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	telemetryChan := make(chan Telemetry)
	clients[telemetryChan] = true

	for {
		telemetry := <-telemetryChan
		jsondata, _ := json.Marshal(telemetry)
		d := time.Now()
		m := "id: %d\ndata: " + string(jsondata) + "\n\n"
		fmt.Fprintf(w, m, d.UnixNano())
		flusher.Flush()
	}
}

func command(w http.ResponseWriter, r *http.Request) {
	requestBody, err := ioutil.ReadAll(r.Body)
	defer r.Body.Close()
	if err != nil {
		log.Printf("1: %v", err)
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		w.WriteHeader(http.StatusBadRequest)
		jsonResp, _ := json.Marshal("{}")
		w.Write(jsonResp)
		return
	}

	var command Command
	err = json.Unmarshal(requestBody, &command)
	if err != nil {
		log.Printf("2: %v", err)
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		w.WriteHeader(http.StatusBadRequest)
		jsonResp, _ := json.Marshal("{}")
		w.Write(jsonResp)
		return
	}

	websocket, ok := edges[command.VehicleID]
	if ok {
		websocket.WriteJSON(command)
		log.Printf("send edge: %v", command.VehicleID)
	}

	log.Printf("success: %v", err)
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	jsonResp, _ := json.Marshal("{}")
	w.Write(jsonResp)
}

func ws(w http.ResponseWriter, r *http.Request) {
	// ゴルーチンで起動
	go broadcastMessagesToClients()
	// websocket の状態を更新
	websocket, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal("error upgrading GET request to a websocket::", err)
	}

	vehicleID := ""
	defer wsClose(websocket, vehicleID)

	for {
		var telemetry Telemetry
		// メッセージ読み込み
		err := websocket.ReadJSON(&telemetry)
		if err != nil {
			log.Printf("error occurred while reading message: %v", err)
			delete(edges, vehicleID)
			break
		}
		vehicleID = telemetry.VehicleID
		_, ok := edges[vehicleID]
		if !ok {
			edges[vehicleID] = websocket
		}
		// メッセージを受け取る
		broadcast <- telemetry
	}
}

func wsClose(websocket *websocket.Conn, vehicleID string) {
	websocket.Close()
	_, ok := edges[vehicleID]
	if ok {
		delete(edges, vehicleID)
	}
}

func broadcastMessagesToClients() {
	for {
		// メッセージ受け取り
		telemetry := <-broadcast
		// クライアントの数だけループ
		for client := range clients {
			//　書き込む
			client <- telemetry
		}
	}
}
