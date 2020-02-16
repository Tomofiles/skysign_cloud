package main

import (
	"log"
	"net"

	"github.com/pion/rtp"
)

func audioStreaming() {
	conn, err := net.ListenPacket("udp", "127.0.0.1:8889")
	if err != nil {
		log.Fatal("udp audio connect error:", err)
	}
	defer func() {
		conn.Close()
		log.Println("udp audio disconnected")
	}()

	buffer := make([]byte, 1500)
	for {
		n, _, err := conn.ReadFrom(buffer)
		if err != nil {
			log.Fatal("rtp audio receive error:", err)
		}

		if !isConnected {
			continue
		}

		audioTrackLock.Lock()
		packet := rtp.Packet{}
		packet.Unmarshal(buffer[:n])
		packet.PayloadType = audioTrack.PayloadType()
		packet.SSRC = audioTrack.SSRC()

		audioTrack.WriteRTP(&packet)
		audioTrackLock.Unlock()
	}
}

func videoStreaming() {
	conn, err := net.ListenPacket("udp", "127.0.0.1:8888")
	if err != nil {
		log.Fatal("udp video connect error:", err)
	}
	defer func() {
		conn.Close()
		log.Println("udp video disconnected")
	}()

	buffer := make([]byte, 1500)
	for {
		n, _, err := conn.ReadFrom(buffer)
		if err != nil {
			log.Fatal("rtp video receive error:", err)
		}

		if !isConnected {
			continue
		}

		videoTrackLock.Lock()
		packet := rtp.Packet{}
		packet.Unmarshal(buffer[:n])
		packet.PayloadType = videoTrack.PayloadType()
		packet.SSRC = videoTrack.SSRC()

		videoTrack.WriteRTP(&packet)
		videoTrackLock.Unlock()
	}
}
