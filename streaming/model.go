package main

import (
	"sync"

	"github.com/pion/webrtc/v2"
)

type ServerInfo struct {
	URL        string `json:"url"`
	Credential string `json:"credential"`
	Username   string `json:"username"`
}

type SignalingMessage struct {
	Type      string `json:"type"`
	VehicleID string `json:"vehicleID"`
	Result    string `json:"result,omitempty"`
}

type SessionItem struct {
	VideoTrack     *webrtc.Track
	AudioTrack     *webrtc.Track
	VideoTrackLock *sync.RWMutex
	AudioTrackLock *sync.RWMutex
}
