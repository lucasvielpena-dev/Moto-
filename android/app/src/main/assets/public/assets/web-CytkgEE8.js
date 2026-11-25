import { n as WebPlugin } from "./index-Cy2y7gnb.js";
// node_modules/@capgo/background-geolocation/dist/esm/web.js
var BackgroundGeolocationWeb = class BackgroundGeolocationWeb extends WebPlugin {
	constructor() {
		super(...arguments);
		this.plannedRoute = [];
		this.isOffRoute = true;
		this.distanceThreshold = 50;
		this.geofences = /* @__PURE__ */ new Map();
		this.geofenceHeaders = {};
		this.geofencePayload = {};
		this.notifyOnEntry = true;
		this.notifyOnExit = true;
	}
	async start(options, callback) {
		if (!navigator.geolocation) {
			callback(void 0, {
				name: "GeolocationError",
				message: "Geolocation is not supported by this browser",
				code: "NOT_SUPPORTED"
			});
			return;
		}
		if (this.watchId) {
			callback(void 0, {
				name: "GeolocationError",
				message: "Geolocation already started",
				code: "ALREADY_STARTED"
			});
			return;
		}
		this.watchId = navigator.geolocation.watchPosition((position) => {
			const location = {
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
				accuracy: position.coords.accuracy,
				altitude: position.coords.altitude,
				altitudeAccuracy: position.coords.altitudeAccuracy,
				simulated: false,
				bearing: position.coords.heading,
				speed: position.coords.speed,
				time: position.timestamp
			};
			if (this.audio && this.plannedRoute.length > 0) {
				const currentPoint = [position.coords.longitude, position.coords.latitude];
				const offRoute = this.distancePointToRoute(currentPoint) > this.distanceThreshold;
				if (offRoute == true && this.isOffRoute === false) this.audio.play();
				this.isOffRoute = offRoute;
			}
			this.checkGeofences(position.coords.latitude, position.coords.longitude, position.timestamp);
			callback(location);
		}, (error) => {
			callback(void 0, {
				name: "GeolocationError",
				message: error.message,
				code: error.code.toString()
			});
		}, {
			enableHighAccuracy: true,
			timeout: 1e4,
			maximumAge: options.stale ? 3e5 : 0
		});
	}
	async stop() {
		if (this.watchId) {
			navigator.geolocation.clearWatch(this.watchId);
			delete this.watchId;
		}
	}
	async openSettings() {
		console.log("openSettings: Web implementation cannot open native settings");
		window.alert("Please enable location permissions in your browser settings");
	}
	async setPlannedRoute(options) {
		if (!options.soundFile) throw new Error("Sound file is required");
		if (this.audio) {
			this.audio.pause();
			this.audio.src = "";
			this.audio = void 0;
		}
		this.audio = new Audio(options.soundFile);
		this.plannedRoute = options.route || [];
		this.distanceThreshold = options.distance || 50;
	}
	async setupGeofencing(options) {
		var _a, _b, _c, _d;
		if (options.url) new URL(options.url);
		this.geofenceUrl = options.url;
		this.geofenceHeaders = Object.assign({}, (_a = options.headers) !== null && _a !== void 0 ? _a : {});
		this.notifyOnEntry = (_b = options.notifyOnEntry) !== null && _b !== void 0 ? _b : true;
		this.notifyOnExit = (_c = options.notifyOnExit) !== null && _c !== void 0 ? _c : true;
		this.geofencePayload = (_d = options.payload) !== null && _d !== void 0 ? _d : {};
	}
	async updateHeaders(options) {
		var _a;
		this.geofenceHeaders = Object.assign({}, (_a = options.headers) !== null && _a !== void 0 ? _a : {});
	}
	/** Resolves at once: the web implementation POSTs each transition immediately, with no queue. */
	async clearGeofenceQueue() {}
	async addGeofence(options) {
		var _a, _b, _c, _d;
		if (!navigator.geolocation) throw new Error("Geolocation is not supported by this browser");
		this.validateGeofence(options.latitude, options.longitude, (_a = options.radius) !== null && _a !== void 0 ? _a : 50, options.identifier);
		this.geofences.set(options.identifier, {
			latitude: options.latitude,
			longitude: options.longitude,
			radius: (_b = options.radius) !== null && _b !== void 0 ? _b : 50,
			identifier: options.identifier,
			notifyOnEntry: (_c = options.notifyOnEntry) !== null && _c !== void 0 ? _c : this.notifyOnEntry,
			notifyOnExit: (_d = options.notifyOnExit) !== null && _d !== void 0 ? _d : this.notifyOnExit,
			payload: options.payload
		});
		this.startGeofenceWatch();
	}
	async removeGeofence(options) {
		if (!options.identifier) throw new Error("Identifier is required");
		this.geofences.delete(options.identifier);
		this.stopGeofenceWatchIfIdle();
	}
	async removeAllGeofences() {
		this.geofences.clear();
		this.stopGeofenceWatchIfIdle();
	}
	async getMonitoredGeofences() {
		return { regions: Array.from(this.geofences.keys()) };
	}
	async getLocationLog() {
		return { entries: [] };
	}
	async clearLocationLog() {}
	async checkPermissions() {
		if (!navigator.permissions) return {
			location: "prompt",
			backgroundLocation: "prompt",
			notification: "granted"
		};
		try {
			const status = await navigator.permissions.query({ name: "geolocation" });
			const location = status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt";
			return {
				location,
				backgroundLocation: location,
				notification: "granted"
			};
		} catch (_a) {
			return {
				location: "prompt",
				backgroundLocation: "prompt",
				notification: "granted"
			};
		}
	}
	async requestPermissions() {
		return this.checkPermissions();
	}
	validateGeofence(latitude, longitude, radius, identifier) {
		if (!identifier) throw new Error("Identifier is required");
		if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Latitude must be between -90 and 90");
		if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Longitude must be between -180 and 180");
		if (!Number.isFinite(radius) || radius <= 0) throw new Error("Radius must be greater than 0");
	}
	startGeofenceWatch() {
		if (this.geofenceWatchId !== void 0 || this.geofences.size === 0 || !navigator.geolocation) return;
		this.geofenceWatchId = navigator.geolocation.watchPosition((position) => this.checkGeofences(position.coords.latitude, position.coords.longitude, position.timestamp), () => void 0, {
			enableHighAccuracy: false,
			timeout: 3e4,
			maximumAge: 6e4
		});
	}
	stopGeofenceWatchIfIdle() {
		if (this.geofences.size > 0 || this.geofenceWatchId === void 0) return;
		navigator.geolocation.clearWatch(this.geofenceWatchId);
		this.geofenceWatchId = void 0;
	}
	checkGeofences(latitude, longitude, time) {
		const point = [longitude, latitude];
		this.geofences.forEach((geofence) => {
			const inside = this.haversine(point, [geofence.longitude, geofence.latitude]) <= geofence.radius;
			const previousInside = geofence.inside;
			geofence.inside = inside;
			if (inside && previousInside !== true && geofence.notifyOnEntry) this.emitGeofenceTransition(geofence, true, time);
			else if (!inside && previousInside === true && geofence.notifyOnExit) this.emitGeofenceTransition(geofence, false, time);
		});
	}
	emitGeofenceTransition(geofence, enter, time) {
		var _a;
		const payload = Object.assign(Object.assign({}, this.geofencePayload), (_a = geofence.payload) !== null && _a !== void 0 ? _a : {});
		const event = Object.assign(Object.assign({}, payload), {
			identifier: geofence.identifier,
			transition: enter ? "enter" : "exit",
			enter,
			latitude: geofence.latitude,
			longitude: geofence.longitude,
			radius: geofence.radius,
			payload,
			time
		});
		this.notifyListeners("geofenceTransition", event);
		if (this.geofenceUrl) fetch(this.geofenceUrl, {
			method: "POST",
			headers: Object.assign({
				Accept: "application/json",
				"Content-Type": "application/json"
			}, this.geofenceHeaders),
			body: JSON.stringify(event)
		}).catch(() => void 0);
	}
	toRadians(degrees) {
		return degrees * Math.PI / 180;
	}
	haversine(point1, point2) {
		const [lon1, lat1] = point1;
		const [lon2, lat2] = point2;
		const dLat = this.toRadians(lat2 - lat1);
		const dLon = this.toRadians(lon2 - lon1);
		const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return BackgroundGeolocationWeb.EARTH_RADIUS_M * c;
	}
	distancePointToLineSegment(point, lineStart, lineEnd) {
		const dist_A_B = this.haversine(point, lineStart);
		const dist_A_C = this.haversine(point, lineEnd);
		const dist_B_C = this.haversine(lineStart, lineEnd);
		if (dist_B_C === 0) return dist_A_B;
		if ((dist_A_B ** 2 + dist_B_C ** 2 - dist_A_C ** 2) / (2 * dist_A_B * dist_B_C + Number.EPSILON) < 0) return dist_A_B;
		if ((dist_A_C ** 2 + dist_B_C ** 2 - dist_A_B ** 2) / (2 * dist_A_C * dist_B_C + Number.EPSILON) < 0) return dist_A_C;
		const s = (dist_A_B + dist_A_C + dist_B_C) / 2;
		return 2 * Math.sqrt(Math.max(0, s * (s - dist_A_B) * (s - dist_A_C) * (s - dist_B_C))) / (dist_B_C + Number.EPSILON);
	}
	distancePointToRoute(point) {
		if (this.plannedRoute.length < 2) {
			if (this.plannedRoute.length === 1) return this.haversine(point, this.plannedRoute[0]);
			return Infinity;
		}
		let minDistance = Infinity;
		for (let i = 0; i < this.plannedRoute.length - 1; i++) {
			const lineStart = this.plannedRoute[i];
			const lineEnd = this.plannedRoute[i + 1];
			const distance = this.distancePointToLineSegment(point, lineStart, lineEnd);
			if (distance < minDistance) minDistance = distance;
		}
		return minDistance;
	}
	async getPluginVersion() {
		return { version: "web" };
	}
};
BackgroundGeolocationWeb.EARTH_RADIUS_M = 6371e3;
export { BackgroundGeolocationWeb };
