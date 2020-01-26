let czmlStream = (function() {
    let czmlStream = new Cesium.CzmlDataSource();
    let doc = {
        id: "document",
        version: "1.0"
    };
    czmlStream.process(doc);
    
    return czmlStream;
})();

function drowMouseOverState(position) {
    czmlStream.entities._entities._array
    .filter((element, index, array) => {
        return element._id.startsWith("groundpoint_");
    })
    .forEach((element, index, array) => {
        let packet = {
            id: element._id,
            point: {
                pixelSize: 17.0
            }
        };
        czmlStream.process(packet);
    });

    let pickedObjects = viewer.scene.drillPick(position);
    for (pickedObject of pickedObjects) {
        if (Cesium.defined(pickedObject)) {
            if (pickedObject.id._id.startsWith("groundpoint_")) {
                let packet = {
                    id: pickedObject.id._id,
                    point: {
                        pixelSize: 30.0
                    }
                };
                czmlStream.process(packet);
            }
        }
    }
}

function getDrowDroneStateFunc(vehicleID) {
    this.vehicleID = vehicleID;
    let self = this;

    return function(droneState) {
        drowDroneState(self.vehicleID, droneState);
    }
}

function drowDroneState(vehicleID, droneState) {
    // 地球固定座標での回転を計算
    let pos = Cesium.Cartesian3.fromDegrees(
        droneState.position.longitude,
        droneState.position.latitude,
        droneState.position.altitude);
    let mtx4 = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    let mtx3 = Cesium.Matrix4.getMatrix3(mtx4, new Cesium.Matrix3());
    let base = Cesium.Quaternion.fromRotationMatrix(mtx3);
    // ローカル座標での回転を計算（NED→ENU）
    let quatlocal = new Cesium.Quaternion(
        droneState.orientation.y,
        droneState.orientation.x,
        -droneState.orientation.z,
        droneState.orientation.w);
    let quat90 = Cesium.Quaternion.fromAxisAngle(
        new Cesium.Cartesian3(0, 0, 1),
        Cesium.Math.toRadians(90)
    );
    let quatlocalaft = Cesium.Quaternion.multiply(quatlocal, quat90, new Cesium.Quaternion());
    // 回転を掛け合わせる
    let quat = Cesium.Quaternion.multiply(base, quatlocalaft, new Cesium.Quaternion());

    // ローカルクォータニオンをオイラー角に変換
    let hpr = Cesium.HeadingPitchRoll.fromQuaternion(quatlocal);

    let description =   '<table class="cesium-infoBox-defaultTable"><tbody>' +
                        '<tr><th>機体ID</th><td>' + vehicleID + '</td></tr>' +
                        '<tr><th>飛行モード</th><td>' + droneState.flightMode + '</td></tr>' +
                        '<tr><th>緯度(°)</th><td>' + dispFloor(droneState.position.latitude, 10) + '</td></tr>' +
                        '<tr><th>経度(°)</th><td>' + dispFloor(droneState.position.longitude, 10) + '</td></tr>' +
                        '<tr><th>海抜高度(m)</th><td>' + dispFloor(droneState.position.altitude, 10) + '</td></tr>' +
                        '<tr><th>相対高度(m)</th><td>' + dispFloor(droneState.relativeHeight, 10) + '</td></tr>' +
                        '<tr><th>ヘディング(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.heading), 10) + '</td></tr>' +
                        '<tr><th>ピッチ(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.pitch), 10) + '</td></tr>' +
                        '<tr><th>ロール(°)</th><td>' + dispFloor(Cesium.Math.toDegrees(hpr.roll), 10) + '</td></tr>' +
                        '</tbody></table>';

    let entityID = "drone_" + vehicleID;

    let packet = {
        id: entityID,
        name: "drone " + vehicleID,
        model: {
            gltf: "scene.gltf",
            scale: 0.05,
            minimumPixelSize: 100,
            show: true,
            runAnimations: droneState.arm
        },
        description: description,
        position: {
            cartographicDegrees: [
                droneState.position.longitude,
                droneState.position.latitude,
                droneState.position.altitude
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
        properties: {
            vehicleID: vehicleID
        }
    };
    czmlStream.process(packet);
}

function getDrowMissionPointsFunc(vehicleID, maxPointNum) {
    this.vehicleID = vehicleID;
    this.maxPointNum = maxPointNum;
    let self = this;

    return function(missionPoints) {
        drowMissionPoints(self.vehicleID, maxPointNum, missionPoints);
    }
}

function drowMissionPoints(vehicleID, maxPointNum, missionPoints) {
    let pointIndex = 1;
    for (let missionPoint of missionPoints) {
        let groundPointID = "groundpoint_" + pointIndex + "_" + vehicleID;
        let airPointID = "airpoint_" + pointIndex + "_" + vehicleID;
        let pathID = "height_" + pointIndex + "_" + groundPointID;

        let description =   '<table class="cesium-infoBox-defaultTable"><tbody>' +
                            '<tr><th>機体ID</th><td>' + vehicleID + '</td></tr>' +
                            '<tr><th>緯度(°)</th><td>' + dispFloor(missionPoint.groundPoint.latitude, 10) + '</td></tr>' +
                            '<tr><th>経度(°)</th><td>' + dispFloor(missionPoint.groundPoint.longitude, 10) + '</td></tr>' +
                            '<tr><th>地表高度(m)</th><td>' + dispFloor(missionPoint.groundPoint.altitude, 10) + '</td></tr>' +
                            '<tr><th>対地高度(m)</th><td>' + dispFloor(missionPoint.groundHeight, 10) + '</td></tr>' +
                            '<tr><th>相対高度(m)</th><td>' + dispFloor(missionPoint.relativeHeight, 10) + '</td></tr>' +
                            '</tbody></table>';
        let airAltitude = missionPoint.groundPoint.altitude + missionPoint.groundHeight;

        let groundPointPacket = {
            id: groundPointID,
            name: "mission " + vehicleID,
            description: description,
            position: {
                cartographicDegrees: [
                    missionPoint.groundPoint.longitude,
                    missionPoint.groundPoint.latitude,
                    missionPoint.groundPoint.altitude
                ]
            },
            point: {
                pixelSize: 17.0
            },
            properties: {
                pointNum: missionPoint.pointNum,
                vehicleID: vehicleID
            }
        };

        let airPointPacket = {
            id: airPointID,
            position: {
                cartographicDegrees: [
                    missionPoint.groundPoint.longitude,
                    missionPoint.groundPoint.latitude,
                    airAltitude
                ]
            },
            point: {
                pixelSize: 10.0
            }
        };

        let linePacket = {
            id: pathID,
            polyline: {
                positions: {
                    references: [
                        groundPointID + "#position",
                        airPointID + "#position"
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
            }
        };

        czmlStream.process(groundPointPacket);
        czmlStream.process(airPointPacket);
        czmlStream.process(linePacket);

        if (pointIndex !== 1) {
            let pathId = "path_" + pointIndex + "_" + vehicleID;
            let preAirPointID = "airpoint_" + (pointIndex - 1) + "_" + vehicleID;
            let pathPacket = {
                id: pathId,
                polyline: {
                    positions: {
                        references: [
                            preAirPointID + "#position",
                            airPointID + "#position"
                        ]
                    },
                    width: 10.0,
                    material: {
                        polylineArrow: {
                            color: {
                                rgba: [ 0, 173, 181, 255 ]
                            }
                        }
                    }
                }
            };
            czmlStream.process(pathPacket);
        }

        pointIndex++;
    }
    for (let i = pointIndex; i <= maxPointNum; i++) {
        let groundPointID = "groundpoint_" + i + "_" + vehicleID;
        let airPointID = "airpoint_" + i + "_" + vehicleID;
        let pathID = "height_" + i + "_" + groundPointID;

        let groundPointPacket = {
            id: groundPointID,
            delete: true
        };

        let airPointPacket = {
            id: airPointID,
            delete: true
        };

        let linePacket = {
            id: pathID,
            delete: true
        };

        czmlStream.process(groundPointPacket);
        czmlStream.process(airPointPacket);
        czmlStream.process(linePacket);

        if (i !== 1) {
            let pathId = "path_" + i + "_" + vehicleID;
            let pathPacket = {
                id: pathId,
                delete: true
            };
            czmlStream.process(pathPacket);
        }
    }
}

function getMissionPointsGroundHeightFunc(vehicleID) {
    this.vehicleID = vehicleID;
    let self = this;

    return function(missionPoints) {
        drowMissionPointsGroundHeight(self.vehicleID, missionPoints);
    }
}

function drowMissionPointsGroundHeight(vehicleID, missionPoints) {
    let pointIndex = 1;
    for (let missionPoint of missionPoints) {
        let groundPointID = "groundpoint_" + pointIndex + "_" + vehicleID;
        let airPointID = "airpoint_" + pointIndex + "_" + vehicleID;

        let description =   '<table class="cesium-infoBox-defaultTable"><tbody>' +
                            '<tr><th>機体ID</th><td>' + vehicleID + '</td></tr>' +
                            '<tr><th>緯度(°)</th><td>' + dispFloor(missionPoint.groundPoint.latitude, 10) + '</td></tr>' +
                            '<tr><th>経度(°)</th><td>' + dispFloor(missionPoint.groundPoint.longitude, 10) + '</td></tr>' +
                            '<tr><th>地表高度(m)</th><td>' + dispFloor(missionPoint.groundPoint.altitude, 10) + '</td></tr>' +
                            '<tr><th>対地高度(m)</th><td>' + dispFloor(missionPoint.groundHeight, 10) + '</td></tr>' +
                            '<tr><th>相対高度(m)</th><td>' + dispFloor(missionPoint.relativeHeight, 10) + '</td></tr>' +
                            '</tbody></table>';
        let airAltitude = missionPoint.groundPoint.altitude + missionPoint.groundHeight;

        let groundPointPacket = {
            id: groundPointID,
            description: description,
            position: {
                cartographicDegrees: [
                    missionPoint.groundPoint.longitude,
                    missionPoint.groundPoint.latitude,
                    missionPoint.groundPoint.altitude
                ]
            }
        };

        let airPointPacket = {
            id: airPointID,
            position: {
                cartographicDegrees: [
                    missionPoint.groundPoint.longitude,
                    missionPoint.groundPoint.latitude,
                    airAltitude
                ]
            }
        };

        czmlStream.process(groundPointPacket);
        czmlStream.process(airPointPacket);

        pointIndex++;
    }
} 

function getDrowTrajectoryStateShowFunc(vehicleID) {
    this.vehicleID = vehicleID;
    let self = this;

    return function(trajectoryShow) {
        drowTrajectoryStateShow(self.vehicleID, trajectoryShow);
    }
}

function drowTrajectoryStateShow(vehicleID, trajectoryShow) {
    let trajectoryId = "trajectory_" + vehicleID;

    let packet = {};
    if (trajectoryShow) {
        packet = {
            id: trajectoryId,
            positions : {
                cartographicDegrees : []
            },
            polyline : {
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
    } else {
        packet = {
            id: trajectoryId,
            delete: true
        }
    }
    czmlStream.process(packet);
}

function getDrowTrajectoryStateFunc(vehicleID) {
    this.vehicleID = vehicleID;
    let self = this;

    return function(trajectoryPoints) {
        drowTrajectoryState(self.vehicleID, trajectoryPoints);
    }
}

function drowTrajectoryState(vehicleID, trajectoryPoints) {
    let cartographicDegrees = [];
    for (let trajectoryPoint of trajectoryPoints) {
        cartographicDegrees.push(trajectoryPoint.longitude);
        cartographicDegrees.push(trajectoryPoint.latitude);
        cartographicDegrees.push(trajectoryPoint.altitude);
    }

    let trajectoryId = "trajectory_" + vehicleID;

    let packet = {
        id: trajectoryId,
        polyline : {
            positions : {
                cartographicDegrees : cartographicDegrees
            }
        }
    }
    czmlStream.process(packet);
}

function dispFloor(num, digit) {
    return Math.floor(num * Math.pow(10, digit) ) / Math.pow(10, digit);
}
