var viewer;
var czmlStream = new Cesium.CzmlDataSource();
var controlVehicle = {};
var missionPlanningEntity = undefined;

const defaultHeight = 10;

(function () {
    "use strict";

    viewer = new Cesium.Viewer('cesiumContainer', {
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

    var imageryViewModels = [];
    imageryViewModels.push(new Cesium.ProviderViewModel({
        name : 'Bing Maps Aerial',
        iconUrl : Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/bingAerial.png'),
        tooltip : 'Bing Maps aerial imagery, provided by Cesium ion',
        category: 'Cesium ion',
        creationFunction : function() {
            return new Cesium.IonImageryProvider({ assetId: 2 });
        }
    }));

    var terrainViewModels = [];
    terrainViewModels.push(new Cesium.ProviderViewModel({
        name : 'Cesium World Terrain',
        iconUrl : Cesium.buildModuleUrl('Widgets/Images/TerrainProviders/CesiumWorldTerrain.png'),
        tooltip : 'High-resolution global terrain tileset curated from several datasources and hosted by Cesium ion',
        category: 'Cesium ion',
        creationFunction : function(){
            return Cesium.createWorldTerrain();
        }
    }));

    var baseLayerPicker = new Cesium.BaseLayerPicker('baseLayerPickerContainer', {
        globe : viewer.scene.globe,
        imageryProviderViewModels : imageryViewModels,
        terrainProviderViewModels : terrainViewModels
    });

    var telemetryStreamUrl = '/client/telemetry';

    var telemetryEventSource = new EventSource(telemetryStreamUrl);

    telemetryEventSource.onmessage = telemetryReceive

    viewer.dataSources.add(czmlStream);

    viewer.clock.shouldAnimate = true;
    var initialPosition = new Cesium.Cartesian3.fromDegrees(139.2540635, 35.6680669, 300);
    var homeCameraView = {
        destination : initialPosition,
    };
    viewer.scene.camera.setView(homeCameraView);

    var doc = {
        id: "document",
        version: "1.0"
    };
    czmlStream.process(doc);

    viewer.selectedEntityChanged.addEventListener(selectedEntityChange);
    controlVehicle = {
        vehicleId: "",
        arm: false,
        disarm: false,
        takeoff: false,
        land: false,
        rtl: false,
        mission: false,
        upload: false,
        start: false,
        pause: false,
        planning: false,
        clear: false
    };
    changeButton();

    var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(doubleClickeEvent, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction(mouseMoveEvent, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}());

function formatDate(date) {

    var format = "YYYY-MM-DDTHH:MI:SSZ";

    format = format.replace(/YYYY/, date.getFullYear());
    format = format.replace(/MM/, ('0' + (date.getMonth() + 1)).slice(-2));
    format = format.replace(/DD/, ('0' + (date.getDate())).slice(-2));
    format = format.replace(/HH/, ('0' + (date.getHours())).slice(-2));
    format = format.replace(/MI/, ('0' + (date.getMinutes())).slice(-2));
    format = format.replace(/SS/, ('0' + (date.getSeconds())).slice(-2));

    return format;
}

function telemetryReceive(event) {
    var telemetry = JSON.parse(event.data)
    // 地球固定座標での回転を計算
    var pos = Cesium.Cartesian3.fromDegrees(
        telemetry.position.cartographicDegrees[0],
        telemetry.position.cartographicDegrees[1],
        telemetry.position.cartographicDegrees[2]);
    var mtx4 = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    var mtx3 = Cesium.Matrix4.getMatrix3(mtx4, new Cesium.Matrix3());
    var base = Cesium.Quaternion.fromRotationMatrix(mtx3);
    // ローカル座標での回転を計算（NED→ENU）
    var quatlocal = new Cesium.Quaternion(
        telemetry.orientation.unitQuaternion[1],
        telemetry.orientation.unitQuaternion[0],
        -telemetry.orientation.unitQuaternion[2],
        telemetry.orientation.unitQuaternion[3]);
    var quat90 = Cesium.Quaternion.fromAxisAngle(
        new Cesium.Cartesian3(0, 0, 1),
        Cesium.Math.toRadians(90)
    );
    var quatlocalaft = Cesium.Quaternion.multiply(quatlocal, quat90, new Cesium.Quaternion());
    // 回転を掛け合わせる
    var quat = Cesium.Quaternion.multiply(base, quatlocalaft, new Cesium.Quaternion());

    // ローカルクォータニオンをオイラー角に変換
    var hpr = Cesium.HeadingPitchRoll.fromQuaternion(quatlocal);

    var description =   '<table class="cesium-infoBox-defaultTable"><tbody>' +
                        '<tr><th>機体ID</th><td>' + controlVehicle.vehicleId + '</td></tr>' +
                        '<tr><th>飛行モード</th><td>' + telemetry.flightMode + '</td></tr>' +
                        '<tr><th>緯度(°)</th><td>' + dispFloor(telemetry.position.cartographicDegrees[1], 10) + '</td></tr>' +
                        '<tr><th>経度(°)</th><td>' + dispFloor(telemetry.position.cartographicDegrees[0], 10) + '</td></tr>' +
                        '<tr><th>海抜高度(m)</th><td>' + dispFloor(telemetry.position.cartographicDegrees[2], 10) + '</td></tr>' +
                        '<tr><th>相対高度(m)</th><td>' + dispFloor(telemetry.position.cartographicDegrees[3], 10) + '</td></tr>' +
                        '<tr><th>ヘディング(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.heading), 10) + '</td></tr>' +
                        '<tr><th>ピッチ(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.pitch), 10) + '</td></tr>' +
                        '<tr><th>ロール(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.roll), 10) + '</td></tr>' +
                        '</tbody></table>';

    var vehicleId = "drone_" + telemetry.vehicleID;
    var entities = czmlStream.entities._entities._array
                        .filter((element, index, array) => {
                            return element._id === vehicleId;
                        });
    if (entities.length === 0) {
        // init entity
        var packet = {
            id: vehicleId,
            properties: {
                missionExecuting: false
            }
        };
        czmlStream.process(packet);
        var packet = {
            id: "mission_" + telemetry.vehicleID,
            parent: vehicleId,
            properties: {
                itemNum: 0
            }
        };
        czmlStream.process(packet);
        var packet = {
            id: "trajectory_" + telemetry.vehicleID,
            parent: vehicleId,
            polyline : {
                positions : {
                    cartesian : []
                }
            }
        }
        czmlStream.process(packet);
    }

    var packet = {
        id: vehicleId,
        name: telemetry.vehicleID,
        model: {
            gltf: "scene.gltf",
            scale: 0.05,
            minimumPixelSize: 100,
            show: true,
            runAnimations: telemetry.armed
        },
        description: description,
        position: {
            cartographicDegrees: [
                telemetry.position.cartographicDegrees[0],
                telemetry.position.cartographicDegrees[1],
                telemetry.position.cartographicDegrees[2]
            ]
        },
        orientation: {
            unitQuaternion: [
                quat.x,
                quat.y,
                quat.z,
                quat.w
            ]
        },
        path: {
            show: true,
            width: 1,
            material: {
                solidColor: {
                    rgba: [
                        0,
                        255,
                        255,
                        255
                    ]
                }
            }
        }
    };
    czmlStream.process(packet);

    if (telemetry.armed) {
        var trajectoryId = "trajectory_" + telemetry.vehicleID;
        var trajectoryEntity = czmlStream.entities._entities._array
        .filter((element, index, array) => {
            return element._id === trajectoryId;
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);

        var cartesian = [];
        if (trajectoryEntity.polyline) {
            var positions = trajectoryEntity.polyline.positions._value;
    
            positions
            .forEach((element, index, array) => {
                cartesian.push(element.x);
                cartesian.push(element.y);
                cartesian.push(element.z);
            });
        } else {
            cartesian.push(pos.x);
            cartesian.push(pos.y);
            cartesian.push(pos.z);
        }

        cartesian.push(pos.x);
        cartesian.push(pos.y);
        cartesian.push(pos.z);

        var packet = {
            id: trajectoryId,
            polyline : {
                positions : {
                    cartesian : cartesian
                },
                material : {
                    solidColor : {
                        color : {
                            rgba : [148, 0, 211, 255]
                        }
                    }
                },
                width : 3.0
            }
        }
        czmlStream.process(packet);

        var entity = viewer.selectedEntity;
        selectedEntityChange(entity);
    }
}

function selectedEntityChange(entity) {
    if (entity !== undefined && entity._id.startsWith("drone_")) {
        if (missionPlanningEntity !== undefined && entity._id !== missionPlanningEntity._id) {
            displayMessage(entity._name + " can not selected. " + missionPlanningEntity._name + " planning mission.");
            viewer.selectedEntity = undefined;
            return;
        }

        controlVehicle = {
            vehicleId: entity._name,
            arm: true,
            disarm: true,
            takeoff: true,
            land: true,
            rtl: true,
            mission: true,
            upload: false,
            start: false,
            pause: false,
            planning: true,
            clear: false
        };
        if (!entity.properties.missionExecuting._value) {
            controlVehicle.planning = false;
        }

        var missionEntity = entity._children
        .filter((element, index, array) => {
            return element._id.startsWith("mission_");
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);
        // undefinedはありえない
        var point = missionEntity.properties.itemNum._value;
        if (point !== 0) {
            controlVehicle.upload = true;
            controlVehicle.start = true;
            controlVehicle.pause = true;
            controlVehicle.clear = true;
        }

        var trajectoryEntity = entity._children
        .filter((element, index, array) => {
            return element._id.startsWith("trajectory_");
        })
        .reduce((previousValue, currentValue, index, array) => {
            return currentValue;
        }, undefined);
        // undefinedはありえない
        var trj = trajectoryEntity.polyline._positions._value.length;
        if (trj !== 0) {
            controlVehicle.clear = true;
        }
    } else {
        if (missionPlanningEntity !== undefined && missionPlanningEntity.properties.missionExecuting._value) {
            // なにもしない
        } else {
            controlVehicle = {
                vehicleId: "",
                arm: false,
                disarm: false,
                takeoff: false,
                land: false,
                rtl: false,
                mission: false,
                upload: false,
                start: false,
                pause: false,
                planning: false,
                clear: false
            };
            missionPlanningEntity = undefined;
        }
    }
    changeButton();
}

function changeButton() {
    if (!controlVehicle.arm) {
        document.getElementById("button_arm").disabled = "true";
    } else {
        document.getElementById("button_arm").disabled = "";
    }
    if (!controlVehicle.disarm) {
        document.getElementById("button_disarm").disabled = "true";
    } else {
        document.getElementById("button_disarm").disabled = "";
    }
    if (!controlVehicle.takeoff) {
        document.getElementById("button_takeoff").disabled = "true";
    } else {
        document.getElementById("button_takeoff").disabled = "";
    }
    if (!controlVehicle.land) {
        document.getElementById("button_land").disabled = "true";
    } else {
        document.getElementById("button_land").disabled = "";
    }
    if (!controlVehicle.rtl) {
        document.getElementById("button_rtl").disabled = "true";
    } else {
        document.getElementById("button_rtl").disabled = "";
    }
    if (!controlVehicle.upload) {
        document.getElementById("button_upload").disabled = "true";
    } else {
        document.getElementById("button_upload").disabled = "";
    }
    if (!controlVehicle.start) {
        document.getElementById("button_start").disabled = "true";
    } else {
        document.getElementById("button_start").disabled = "";
    }
    if (!controlVehicle.pause) {
        document.getElementById("button_pause").disabled = "true";
    } else {
        document.getElementById("button_pause").disabled = "";
    }
    if (!controlVehicle.mission) {
        document.getElementById("button_mission").disabled = "true";
    } else {
        document.getElementById("button_mission").disabled = "";
    }
    if (!controlVehicle.planning) {
        document.getElementById("button_mission").classList.remove("selected");
    } else {
        document.getElementById("button_mission").classList.add("selected");
    }
    if (!controlVehicle.clear) {
        document.getElementById("button_clear").disabled = "true";
    } else {
        document.getElementById("button_clear").disabled = "";
    }
}

var count = 0;
function displayMessage(message) {
    count++;
    $("#message_container").append('<div class="message message' + count + '" style="display: none;">' + message + '</div>');
    $(function(){
        var lCount = count
        $(".message" + lCount + ":not(:animated)").fadeIn("slow",function(){
            $(this).delay(2000).fadeOut("slow", function() {
                $(".message" + lCount).remove();
            });
        });
    });
}

function arm() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' arm ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' arm ng');
    });
}

function disarm() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' disarm ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' disarm ng');
    });
}

function takeoff() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' takeoff ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' takeoff ng');
    });
}

function land() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' land ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' land ng');
    });
}

function rtl() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' return ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' return ng');
    });
}

function upload() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
        messageID: "upload",
        payload: {
            missionItems: createMissionItems(vehicleId)
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
        displayMessage(vehicleId + ' upload ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' upload ng');
    });
}

function start() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' start ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' start ng');
    });
}

function pause() {
    var vehicleId = controlVehicle.vehicleId;
    var data = {
        vehicleID: vehicleId,
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
        displayMessage(vehicleId + ' pause ok');
    })
    .fail(function() {
        displayMessage(vehicleId + ' pause ng');
    });
}

function mission() {
    var entity = viewer.selectedEntity;
    if (entity !== undefined && entity._id.startsWith("drone_")) {
        var packet = {
            id: entity._id,
            properties: {
                missionExecuting: !entity.properties.missionExecuting._value
            }
        };
        czmlStream.process(packet)
        .then(function(czmlStream) {
            var entity = viewer.selectedEntity;
            missionPlanningEntity = entity;
            selectedEntityChange(missionPlanningEntity);
        });
    } else {
        var packet = {
            id: "drone_" + controlVehicle.vehicleId,
            properties: {
                missionExecuting: false
            }
        };
        czmlStream.process(packet)
        .then(function(czmlStream) {
            missionPlanningEntity = undefined;
            selectedEntityChange(missionPlanningEntity);
        });
    }
}

function clearMission() {
    var entity = viewer.selectedEntity;
    var missionId = "mission_" + controlVehicle.vehicleId;

    czmlStream.entities._entities._array
    .filter((element, index, array) => {
        return element.parent !== undefined && element.parent._id === missionId;
    })
    .forEach((element, index, array) => {
        var packet = {
            id: element._id,
            delete: true
        };
        czmlStream.process(packet);
    });

    var packet = {
        id: missionId,
        properties: {
            itemNum: 0
        }
    };
    czmlStream.process(packet);

    var packet = {
        id: "trajectory_" + controlVehicle.vehicleId,
        polyline : {
            positions : {
                cartesian : []
            }
        }
    };
    czmlStream.process(packet);

    selectedEntityChange(entity);
}

function doubleClickeEvent(clickEvent) {
    if (!missionPlanningEntity) {
        return;
    }

    point++;
    var missionId = "mission_" + controlVehicle.vehicleId;
    
    var foundPosition = false;
    var pickedObject = viewer.scene.pick(clickEvent.position);
    if (viewer.scene.pickPositionSupported) {
        if (viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
            var cartesian = viewer.scene.pickPosition(clickEvent.position);

            if (Cesium.defined(cartesian)) {
                var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                var longitude = Cesium.Math.toDegrees(cartographic.longitude);
                var latitude = Cesium.Math.toDegrees(cartographic.latitude);
                var height = cartographic.height;

                var missionEntity = missionPlanningEntity._children
                .filter((element, index, array) => {
                    return element._id.startsWith("mission_");
                })
                .reduce((previousValue, currentValue, index, array) => {
                    return currentValue;
                }, undefined);
                
                // undefinedはありえない
                var point = missionEntity.properties.itemNum._value;

                var firstPointId = "mission_point_" + controlVehicle.vehicleId + "_" + 1;
                var prePointId = "mission_point_" + controlVehicle.vehicleId + "_" + point;
                var postPointId = "mission_point_" + controlVehicle.vehicleId + "_" + ++point;

                var prePoint = missionEntity._children
                .filter((element, index, array) => {
                    return element._id === prePointId;
                })
                .reduce((previousValue, currentValue, index, array) => {
                    return currentValue;
                }, undefined);

                var firstPoint = missionEntity._children
                .filter((element, index, array) => {
                    return element._id === firstPointId;
                })
                .reduce((previousValue, currentValue, index, array) => {
                    return currentValue;
                }, undefined);

                var relativeHeight = 0;
                if (firstPoint) {
                    relativeHeight = height + defaultHeight - firstPoint.properties.grountHeight._value;
                } else {
                    relativeHeight = defaultHeight;
                }

                var description =   '<table class="cesium-infoBox-defaultTable"><tbody>' +
                                    '<tr><th>機体ID</th><td>' + controlVehicle.vehicleId + '</td></tr>' +
                                    '<tr><th>緯度(°)</th><td>' + dispFloor(latitude, 10) + '</td></tr>' +
                                    '<tr><th>経度(°)</th><td>' + dispFloor(longitude, 10) + '</td></tr>' +
                                    '<tr><th>地表高度(m)</th><td>' + dispFloor(height, 10) + '</td></tr>' +
                                    '<tr><th>対地高度(m)</th><td>' + dispFloor(defaultHeight, 10) + '</td></tr>' +
                                    '<tr><th>相対高度(m)</th><td>' + dispFloor(relativeHeight, 10) + '</td></tr>' +
                                    '</tbody></table>';

                var packet = {
                    id: postPointId,
                    name: "mission point " + point,
                    parent: missionId,
                    description: description,
                    position: {
                        cartographicDegrees: [
                            longitude,
                            latitude,
                            height
                        ]
                    },
                    point: {
                        pixelSize: 17.0
                    },
                    polyline: {
                        positions: {
                            cartographicDegrees: [
                                longitude,
                                latitude,
                                height,
                                longitude,
                                latitude,
                                height + defaultHeight
                            ]
                        },
                        material: {
                            polylineDash: {
                                color: {
                                    rgba: [ 0, 173, 181, 255 ]
                                },
                                dashPattern: 3855
                            }
                        },
                        width: 1
                    },
                    properties: {
                        longitude: longitude,
                        latitude: latitude,
                        grountHeight: height,
                        height: defaultHeight,
                        relativeHeight: relativeHeight
                    }
                };
                czmlStream.process(packet);

                if (point !== 1) {
                    var pathId = "mission_path_" + controlVehicle.vehicleId + "_" + point;
                    var packet = {
                        id: pathId,
                        name: "mission " + controlVehicle.vehicleId,
                        parent: missionId,
                        position: {
                            cartographicDegrees: [
                                longitude,
                                latitude,
                                height
                            ]
                        },
                        polyline: {
                            positions: {
                                cartographicDegrees: [
                                    prePoint.properties.longitude._value,
                                    prePoint.properties.latitude._value,
                                    prePoint.properties.grountHeight._value + prePoint.properties.height._value,
                                    longitude,
                                    latitude,
                                    height + defaultHeight
                                ]
                            },
                            width: 3.0,
                            material: {
                                solidColor: {
                                    color: {
                                        rgba: [ 0, 173, 181, 255 ]
                                    }
                                }
                            }
                        }
                    };
                    czmlStream.process(packet);
                }

                var packet = {
                    id: missionId,
                    properties: {
                        itemNum: point
                    }
                };
                czmlStream.process(packet);

                selectedEntityChange(missionPlanningEntity);

                foundPosition = true;
            }
        }
    }
}

function mouseMoveEvent(moveEvent) {
    czmlStream.entities._entities._array
    .filter((element, index, array) => {
        return element._id.startsWith("mission_point_");
    })
    .forEach((element, index, array) => {
        var packet = {
            id: element._id,
            point: {
                pixelSize: 17.0
            },
            polyline: {
                width: 1
            }
        };
        czmlStream.process(packet);
    });

    var pickedObjects = viewer.scene.drillPick(moveEvent.endPosition);
    for (pickedObject of pickedObjects) {
        if (Cesium.defined(pickedObject)) {
            if (pickedObject.id._point != undefined) {
                var packet = {
                    id: pickedObject.id._id,
                    point: {
                        pixelSize: 30.0
                    },
                    polyline: {
                        width: 3
                    }
                };
                czmlStream.process(packet);
            }
        }
    }
}

function createMissionItems(vehicleId) {
    var points = [];
    czmlStream.entities._entities._array
    .filter((element, index, array) => {
        return element._id.startsWith("mission_point_" + vehicleId);
    })
    .forEach((element, index, array) => {
        points.push(element);
    });
    var missionItems = [];
    for (entity of points) {
        var longitude = entity.properties.longitude._value;
        var latitude = entity.properties.latitude._value;
        var altitude = entity.properties.relativeHeight._value;
        var speed = 5;

        var missionItem = {
            lat: latitude,
            lon: longitude,
            alt: altitude,
            speed: speed
        };
        missionItems.push(missionItem);
    }
    return missionItems;
}

function dispFloor(num, digit) {
    return Math.floor(num * Math.pow(10, digit) ) / Math.pow(10, digit);
}