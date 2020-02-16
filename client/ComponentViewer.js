function displayMessage(message) {
    jsFrame.showToast({
        width: 480,
        height: 120,
        duration: 2000,
        align: 'bottom',
        style: {
            borderRadius: '0',
            backgroundColor: 'rgba(57, 62, 70, 0.85)',
        },
        html: `<span class="message">${message}</span>`
    });
}

function displayVideoStreamingState(vehicleID, close) {
    let widgetName = "videoStreamingWidget_" + vehicleID;
    let videoName = "video_" + vehicleID;

    let frame = jsFrame.create({
        title: 'Video Streaming ' + vehicleID,
        left: 250, top: 20,
        width: 400, height: 329,
        movable: true,
        resizable: true,
        appearanceName: 'material',
        appearanceParam: {
            border: {
                shadow: '2px 2px 10px  rgba(0, 0, 0, 0.5)',
                width: 0,
                radius: 0,
            },
            titleBar: {
                color: 'white',
                background: 'rgba(57, 62, 70, 0.85)',
                height: 30,
                fontSize: 16,
                buttonWidth: 36,
                buttonHeight: 16,
                buttonColor: 'white',
                buttons: [
                    {
                        fa: 'fas fa-times',
                        name: 'closeButton',
                        visible: true
                    },
                ]
            },
        },
        style: {
            backgroundColor: 'rgba(57, 62, 70, 0.85)',
            overflow: 'hidden'
        },
        html: ` <div id="${widgetName}" class="video_streaming_wrapper">
                    <div class="video_streaming_margin">
                        <video id="${videoName}" class="video_streaming" autoplay muted controls></video>
                    </div>
                </div>
                `
    });
    frame.setControl({
        hideButton: 'closeButton'
    });
    frame.control.on('hid', (frame, info) => {
        frame.closeFrame();
        close();
    });

    frame.show();

    return videoName;
}
