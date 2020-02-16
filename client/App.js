const jsFrame = new JSFrame();

let groundHeightSub = undefined;
let heightScaleSub = undefined;
let missionPointsSub = undefined;
let missionPointsGroundHeightSub = undefined;

let droneStateList = [];

let buttonStateViewModel = (() => {
    let buttonStateViewModel = new ButtonStateViewModel();

    let sideMenu = document.getElementById('side_menu');
    Cesium.knockout.applyBindings(buttonStateViewModel, sideMenu);

    return buttonStateViewModel;
})();

let viewer = (() => {
    "use strict";

    let viewer = new Cesium.Viewer('cesium_container', {
        scene3DOnly: true,
        selectionIndicator: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        homeButton: false,
        geocoder: false,
        animation: false,
        timeline: false,
        fullscreenButton: false
    });

    let imageryViewModels = [];
    imageryViewModels.push(new Cesium.ProviderViewModel({
        name : 'Bing Maps Aerial',
        iconUrl : Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/bingAerial.png'),
        tooltip : 'Bing Maps aerial imagery, provided by Cesium ion',
        category: 'Cesium ion',
        creationFunction : function() {
            return new Cesium.IonImageryProvider({ assetId: 2 });
        }
    }));

    let terrainViewModels = [];
    terrainViewModels.push(new Cesium.ProviderViewModel({
        name : 'Cesium World Terrain',
        iconUrl : Cesium.buildModuleUrl('Widgets/Images/TerrainProviders/CesiumWorldTerrain.png'),
        tooltip : 'High-resolution global terrain tileset curated from several datasources and hosted by Cesium ion',
        category: 'Cesium ion',
        creationFunction : function(){
            return Cesium.createWorldTerrain();
        }
    }));

    Cesium.BaseLayerPicker('base_layer_picker_container', {
        globe : viewer.scene.globe,
        imageryProviderViewModels : imageryViewModels,
        terrainProviderViewModels : terrainViewModels
    });

    viewer.clock.shouldAnimate = true;
    let initialPosition = new Cesium.Cartesian3.fromDegrees(139.2540635, 35.6680669, 300);
    let homeCameraView = {
        destination : initialPosition,
    };
    viewer.scene.camera.setView(homeCameraView);

    let handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(doubleClickEvent, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction(mouseMoveEvent, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewer.selectedEntityChanged.addEventListener(selectedEntityChange);

    let telemetryStreamUrl = '/client/telemetry';
    let telemetryEventSource = new EventSource(telemetryStreamUrl);
    telemetryEventSource.onmessage = telemetryReceive

    viewer.dataSources.add(czmlStream);

    return viewer;
})();

function selectedEntityChange(entity) {
    if (entity !== undefined && entity._id.startsWith("drone_")) {
        let droneStateViewModel = droneStateList
        .filter((drone, index, array) => {
            return drone.vehicleID === entity.properties.vehicleID._value;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);
        if (buttonStateViewModel.selectedDrone !== undefined && buttonStateViewModel.selectedDrone.vehicleID !== droneStateViewModel.vehicleID) {
            if (buttonStateViewModel.planning) {
                displayMessage(droneStateViewModel.vehicleID + " can not selected. " + buttonStateViewModel.selectedDrone.vehicleID + " planning mission.");
                viewer.selectedEntity = undefined;
            }
        }
        buttonStateViewModel.selectedDrone = droneStateViewModel;
    } else if (entity !== undefined && entity._id.startsWith("groundpoint_")) {
        if (!buttonStateViewModel.selectedDrone) {
            return;
        }
        let pointNum = entity.properties.pointNum._value;
        let vehicleID = entity.properties.vehicleID._value;
        let missionPoint = buttonStateViewModel.selectedDrone.missionState.missionPoints
        .filter((waypoint, index, array) => {
            return waypoint.pointNum === pointNum;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);
        if (missionPoint) {
            if (!buttonStateViewModel.selectedDrone) {
                buttonStateViewModel.selectedDrone = undefined;
                return;
            }

            $("#waypointEditWidget").remove();
            if (buttonStateViewModel.selectedDrone !== undefined && buttonStateViewModel.selectedDrone.vehicleID !== vehicleID) {
                buttonStateViewModel.selectedDrone = undefined;
                return 
            }
            if (!buttonStateViewModel.planning) {
                buttonStateViewModel.selectedDrone = undefined;
                return;
            }
            $("#waypoint_edit_container").append(`
            <div id="waypointEditWidget" class="waypoint_edit">
                <input id="waypointGroundHeightSlider" type="range" min="0" step="0.1" data-bind="value: groundHeight, valueUpdate: 'input', max: heightScale">
                <div class="waypoint_edit_height"><span style="margin-right: 1em;">Height</span><input type="text" size="10" class="waypoint_edit_height_input" data-bind="value: groundHeight, valueUpdate: 'enterkey'"></div>
                <div class="waypoint_edit_heightscale"><span style="margin-right: 1em;">Scale</span><input type="text" size="10" class="waypoint_edit_heightscale_input" data-bind="value: heightScale, valueUpdate: 'enterkey'"></div>
                <button type="button" onClick="deleteWaypoint()" class="button waypoint_edit_button">DELETE</button>
            </div>`);
            changeHeightScale(missionPoint.heightScale);
            let waypointEdit = document.getElementById('waypointEditWidget');
            Cesium.knockout.applyBindings(missionPoint, waypointEdit);
            groundHeightSub = Cesium.knockout.getObservable(missionPoint, 'groundHeight').subscribe((groundHeight) => buttonStateViewModel.selectedDrone.missionState.changeHeight(missionPoint.pointNum, Number.parseFloat(groundHeight)) );
            heightScaleSub = Cesium.knockout.getObservable(missionPoint, 'heightScale').subscribe(changeHeightScale);
        }
    } else {
        viewer.selectedEntity = undefined;
        if (!buttonStateViewModel.planning) {
            buttonStateViewModel.selectedDrone = undefined;
        }
        $("#waypointEditWidget").remove();
        if (groundHeightSub) {
            groundHeightSub.dispose();
        }
        if (heightScaleSub) {
            heightScaleSub.dispose();
        }
    }
}

function telemetryReceive(event) {
    let telemetry = JSON.parse(event.data)

    let droneStateViewModel = undefined;
    let isFirstReceive = true;

    if (droneStateList.length !== 0) {
        droneStateViewModel = droneStateList
        .filter((drone, index, array) => {
            return drone.vehicleID === telemetry.vehicleID;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);
        if (!droneStateViewModel) {
            droneStateViewModel = new DroneStateViewModel(telemetry.vehicleID);
            droneStateViewModel.trajectoryState = new TrajectoryStateViewModel();
            droneStateViewModel.videoStreamingState = new VideoStreamingStateViewModel();
        } else {
            isFirstReceive = false;
        }
    } else {
        droneStateViewModel = new DroneStateViewModel(telemetry.vehicleID);
        droneStateViewModel.trajectoryState = new TrajectoryStateViewModel();
        droneStateViewModel.videoStreamingState = new VideoStreamingStateViewModel();
    }

    if (isFirstReceive) {
        droneStateList.push(droneStateViewModel);
        Cesium.knockout.getObservable(droneStateViewModel, 'droneState').subscribe(new getDrowDroneStateFunc(telemetry.vehicleID));
        Cesium.knockout.getObservable(droneStateViewModel.trajectoryState, 'trajectoryShow').subscribe(new getDrowTrajectoryStateShowFunc(telemetry.vehicleID));
        Cesium.knockout.getObservable(droneStateViewModel.trajectoryState, 'trajectoryPoints').subscribe(new getDrowTrajectoryStateFunc(telemetry.vehicleID));
    }

    let position = new Position(
        telemetry.position.cartographicDegrees[0],
        telemetry.position.cartographicDegrees[1],
        telemetry.position.cartographicDegrees[2]
    );
    let orientation = new Orientation(
        telemetry.orientation.unitQuaternion[0],
        telemetry.orientation.unitQuaternion[1],
        telemetry.orientation.unitQuaternion[2],
        telemetry.orientation.unitQuaternion[3]
    );
    let relativeHeight = telemetry.position.cartographicDegrees[3];
    droneStateViewModel.update(telemetry.armed, telemetry.flightMode, position, orientation, relativeHeight);

    if (telemetry.armed) {
        droneStateViewModel.trajectoryState.update(position);
    }

    droneStateViewModel.videoStreamingState.streaming = telemetry.videoStreaming;
}

function mission() {
    let entity = viewer.selectedEntity;
    buttonStateViewModel.planning = !buttonStateViewModel.planning;
    if (entity !== undefined && entity._id.startsWith("drone_")) {
        let vehicleID = entity.properties.vehicleID._value;

        let droneStateViewModel = droneStateList
        .filter((drone, index, array) => {
            return drone.vehicleID === vehicleID;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);

        let missionStateViewModel = new MissionStateViewModel();
        if (droneStateViewModel.missionState) {
            missionStateViewModel = droneStateViewModel.missionState;
        }
    
        missionPointsSub = Cesium.knockout.getObservable(missionStateViewModel, 'missionPoints').subscribe(new getDrowMissionPointsFunc(vehicleID, missionStateViewModel.maxPointNum));
        missionPointsGroundHeightSub = Cesium.knockout.getObservable(missionStateViewModel, 'missionPointsGroundHeight').subscribe(new getMissionPointsGroundHeightFunc(vehicleID));

        buttonStateViewModel.selectedDrone.missionState = missionStateViewModel;
    }
    if (entity === undefined || entity !== undefined && !entity._id.startsWith("drone_")) {
        if (missionPointsSub) {
            missionPointsSub.dispose();
        }
        if (missionPointsGroundHeightSub) {
            missionPointsGroundHeightSub.dispose();
        }
        buttonStateViewModel.selectedDrone = undefined;
    }
    if (entity === undefined || entity !== undefined && entity._id.startsWith("groundpoint_")) {
        $("#waypointEditWidget").remove();
    }
}

function clearMission() {
    buttonStateViewModel.selectedDrone.missionState.removeAllWaypoint();
    buttonStateViewModel.selectedDrone.trajectoryState.removeAll();
}

function deleteWaypoint() {
    let entity = viewer.selectedEntity;
    if (entity === undefined || entity !== undefined && entity._id.startsWith("groundpoint_")) {
        let vehicleID = entity.properties.vehicleID._value;

        let droneStateViewModel = droneStateList
        .filter((drone, index, array) => {
            return drone.vehicleID === vehicleID;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);

        let pointNum = entity.properties.pointNum._value;
        droneStateViewModel.missionState.removeWaypoint(pointNum);

        viewer.selectedEntity = undefined;
    }
}

function doubleClickEvent(clickEvent) {
    if (!buttonStateViewModel.selectedDrone) {
        return;
    }

    if (viewer.scene.pickPositionSupported) {
        let cartesian = viewer.scene.pickPosition(clickEvent.position);

        if (Cesium.defined(cartesian)) {
            let cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            let longitude = Cesium.Math.toDegrees(cartographic.longitude);
            let latitude = Cesium.Math.toDegrees(cartographic.latitude);
            let height = cartographic.height;

            let point = new Position(longitude, latitude, height);
            buttonStateViewModel.selectedDrone.missionState.addWaypoint(point);
        }
    }
}

function mouseMoveEvent(moveEvent) {
    drowMouseOverState(moveEvent.endPosition);
}

function changeHeightScale(heightScale) {
    let heightSlider = document.getElementById('waypointGroundHeightSlider');
    heightSlider.max = heightScale;
    buttonStateViewModel.selectedDrone.missionState.missionPoints.forEach((missionPoint) => missionPoint.heightScale = heightScale);
}

function arm() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "arm",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' arm ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' arm ng');
    });
}

function disarm() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "disarm",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' disarm ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' disarm ng');
    });
}

function takeoff() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "takeoff",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' takeoff ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' takeoff ng');
    });
}

function land() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "land",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' land ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' land ng');
    });
}

function rtl() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "rtl",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' return ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' return ng');
    });
}

function upload() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "upload",
        payload: {
            missionItems: createMissionItems(vehicleID)
        }
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' upload ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' upload ng');
    });
}

function start() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "start",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' start ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' start ng');
    });
}

function pause() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "pause",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' pause ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' pause ng');
    });
}

function createMissionItems(vehicleID) {
    let droneStateViewModel = droneStateList
    .filter((drone, index, array) => {
        return drone.vehicleID === vehicleID;
    })
    .reduce((previousValue, currentValue, index, array) => {
        return currentValue;
    }, undefined);

    let missionItems = [];
    for (missionPoint of droneStateViewModel.missionState.missionPoints) {
        let speed = 5;

        let missionItem = {
            lat: missionPoint.groundPoint.latitude,
            lon: missionPoint.groundPoint.longitude,
            alt: missionPoint.relativeHeight,
            speed: speed
        };
        missionItems.push(missionItem);
    }
    return missionItems;
}

function video() {
    let droneStateViewModel = buttonStateViewModel.selectedDrone;

    if (droneStateViewModel.videoStreamingState.display === true) {
        return;
    }
    droneStateViewModel.videoStreamingState.display = true;

    let stopFunc = undefined;
    let videoName = displayVideoStreamingState(droneStateViewModel.vehicleID, function() {
        droneStateViewModel.videoStreamingState.display = false;
        if (stopFunc) {
            stopFunc();
        }
    });

    stopFunc = streamingStart(videoName, droneStateViewModel.vehicleID);
}

function streamon() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "streamon",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' stream on ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' stream on ng');
    });
}

function streamoff() {
    let vehicleID = buttonStateViewModel.selectedDrone.vehicleID;
    let data = {
        vehicleID: vehicleID,
        messageID: "streamoff",
        payload: {}
    };
    $.ajax({
        type: 'POST',
        url: '/client/command',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: "application/json; charset=UTF-8"
    })
    .done(function(data) {
        displayMessage(vehicleID + ' stream off ok');
    })
    .fail(function() {
        displayMessage(vehicleID + ' stream off ng');
    });
}