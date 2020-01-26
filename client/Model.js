function ButtonStateViewModel() {
    this.selectedDrone = undefined;
    this.planning = false;

    this.arm = () => {
        return this.selectedDrone !== undefined
    },
    this.disarm = () => {
        return this.selectedDrone !== undefined
    },
    this.takeoff = () => {
        return this.selectedDrone !== undefined
    },
    this.land = () => {
        return this.selectedDrone !== undefined
    },
    this.rtl = () => {
        return this.selectedDrone !== undefined
    },
    this.mission = () => {
        return this.selectedDrone !== undefined
    },
    this.upload = () => {
        return this.selectedDrone !== undefined && !this.selected() && this.selectedDrone.missionState !== undefined && this.selectedDrone.missionState.missionPoints.length !== 0
    },
    this.start = () => {
        return this.selectedDrone !== undefined && !this.selected() && this.selectedDrone.missionState !== undefined && this.selectedDrone.missionState.missionPoints.length !== 0
    },
    this.pause = () => {
        return this.selectedDrone !== undefined && !this.selected() && this.selectedDrone.missionState !== undefined && this.selectedDrone.missionState.missionPoints.length !== 0
    },
    this.selected = () => {
        return this.planning ? "selected" : ""
    },
    this.clear = () => {
        return this.selectedDrone !== undefined && this.selected() && this.selectedDrone.missionState !== undefined && this.selectedDrone.missionState.missionPoints.length !== 0
    }

    return this
};

function DroneStateViewModel(vehicleID) {
    this.vehicleID = vehicleID;
    this.droneState = undefined;
    this.missionState = undefined;
    this.trajectoryState = undefined;

    Cesium.knockout.track(this);
    return this;
}

DroneStateViewModel.prototype.update = function(arm, flightMode, position, orientation, relativeHeight) {
    this.droneState = new DroneState(arm, flightMode, position, orientation, relativeHeight);
}

function DroneState(arm, flightMode, position, orientation, relativeHeight) {
    this.arm = arm;
    this.flightMode = flightMode;
    this.position = position;
    this.orientation = orientation;
    this.relativeHeight = relativeHeight;

    return this;
}

function Position(longitude, latitude, altitude) {
    this.longitude = longitude;
    this.latitude = latitude;
    this.altitude = altitude;

    return this;
}

function Orientation(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;

    return this;
}

function MissionStateViewModel() {
    this.pointNum = 0;
    this.missionPoints = [];
    this.missionPointsGroundHeight = [];
    this.maxPointNum = 99;

    Cesium.knockout.track(this);
    return this;
}

MissionStateViewModel.prototype.addWaypoint = function(point) {
    if ((this.missionPoints.length + 1) === this.maxPointNum) {
        alert("you can not add point.");
        return;
    }
    let groundPoint = new PointStateViewModel(point);
    let groundHeight = 10;
    this.pointNum++;
    let relativeHeight = groundHeight;
    if (this.missionPoints.length !== 0) {
        relativeHeight = (point.altitude + groundHeight) - this.missionPoints[0].groundPoint.altitude;
    }
    let waypoint = new WaypointStateViewModel(this.pointNum, groundPoint, groundHeight, relativeHeight);
    this.missionPoints.push(waypoint);
}

MissionStateViewModel.prototype.removeWaypoint = function (pointNum) {
    this.missionPoints.remove((waypoint) => {return waypoint.pointNum === pointNum});
    this.missionPointsGroundHeight = this.missionPoints;
}

MissionStateViewModel.prototype.removeAllWaypoint = function () {
    this.pointNum = 0;
    this.missionPoints = [];
    this.missionPointsGroundHeight = [];
}

MissionStateViewModel.prototype.changeHeight = function (pointNum, height) {
    for (let missionPoint of this.missionPoints) {
        if (missionPoint.pointNum === pointNum) {
            missionPoint.groundHeight = height;
            missionPoint.relativeHeight = (missionPoint.groundPoint.altitude + height) - this.missionPoints[0].groundPoint.altitude;
        }
    }
    this.missionPointsGroundHeight = this.missionPoints;
}

function WaypointStateViewModel(pointNum, groundPoint, groundHeight, relativeHeight) {
    this.pointNum = pointNum;
    this.groundPoint = groundPoint;
    this.groundHeight = groundHeight;
    this.relativeHeight = relativeHeight;
    this.heightScale = 30;

    Cesium.knockout.track(this);
    return this;
}

function PointStateViewModel(point) {
    this.longitude = point.longitude;
    this.latitude = point.latitude;
    this.altitude = point.altitude;

    return this;
}

function TrajectoryStateViewModel() {
    this.trajectoryShow = false;
    this.trajectoryPoints = [];

    Cesium.knockout.track(this);
    return this;
}

TrajectoryStateViewModel.prototype.update = function (point) {
    this.trajectoryShow = true;
    this.trajectoryPoints.push(point);
}

TrajectoryStateViewModel.prototype.removeAll = function () {
    this.trajectoryShow = false;
    this.trajectoryPoints = [];
}
