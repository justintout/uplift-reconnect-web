const serviceUUID = '0000ff12-0000-1000-8000-00805f9b34fb';
const dataInCharacteristicUUID = '0000ff01-0000-1000-8000-00805f9b34fb';
const dataOutCharacteristicUUID = '0000ff02-0000-1000-8000-00805f9b34fb';

const directionPacketDelay = 300; //ms
const deskQueryPacket = new Uint8Array([0xf1, 0xf1, 0x07, 0x00, 0x07, 0x7e]); // TODO: is this right? the app sends this at the beginning of connection so maybe?
const deskUpPacket = new Uint8Array([0xf1, 0xf1, 0x01, 0x00, 0x01, 0x7e]);
const deskDownPacket = new Uint8Array([0xf1, 0xf1, 0x02, 0x00, 0x02, 0x7e]);
const heightNotificationDifference = 20; 

// TODO: how to get height out of the notifications?
let standingHeightValues = [200, 212];
let sittingHeightValues = [41, 60]; 
let lastHeightValues;
let automaticallyReconnnect = false;


let desk;

/**
 * ConnectionEvent is fired when the current BLE connection changes
 */
class ConnectionEvent extends CustomEvent {
    /**
     * 
     * @param {*} connected 
     */
    constructor(connected) {
        super('connectionchanged', {detail: {connected}});
    }
}

class HeightEvent extends CustomEvent {
    /**
     * Create a new HeightEvent
     * @param {[number, number]} height last received height notification's bytes at 5 and 7
     */
    constructor(height) {
        super('heightchanged', {detail: {height}})
    }
}

class OptionsEvent extends CustomEvent {
    /**
     * 
     * @param {[number, number]} standingHeight User-specified "standing" height 
     * @param {[number, number]} sittingHeight User-specified "sitting" height
     * @param {boolean} reconnect If app should automatically reconnect if BLE disconnects without user intention
     */
    constructor(standingHeight, sittingHeight, reconnect) {
        super('optionschanged', {detail: {standingHeight, sittingHeight, reconnect}});
    }

    /**
     * Create an OptionsEvent passing only the new standing height
     */
    static standingHeightChanged(height) {
        return new OptionsEvent(height, sittingHeightValues, automaticallyReconnect);
    }

    /**
     * Create an OptionsEvent passing only the new sitting height
     * @param {[number, number]} height New sitting height
     */
    static sittingHeightChanged(height) {
        return new OptionsEvent(standingHeightValues, height, automaticallyReconnnect);
    }

    /**
     * Create an OptionsEvent passing only the new reconnect flag
     * @param {boolean} reconnect 
     */
    static reconnectChanged(reconnect) {
        return new OptionsEvent(standingHeightValues, sittingHeightValues, reconnect);
    }
}

class Desk {
    
    constructor(device) {
        this.device = device;
    }
    
    async connect() {
        this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
        this.server = await this.device.gatt.connect(); 
        this.service = (await this.server.getPrimaryServices(serviceUUID))[0];
        this.dataInCharacteristic = await this.service.getCharacteristic(dataInCharacteristicUUID);
        this.dataOutCharacteristic = await this.service.getCharacteristic(dataOutCharacteristicUUID);
        window.dispatchEvent(new ConnectionEvent(true));
        await this.startNotifications();
    }

    async disconnect() {
        await this.stopNotifications();
        this.server.disconnect();
        this.server = undefined;
        this.dataInCharacteristic = undefined;
        this.dataOutCharacteristic = undefined;
    }

    async startNotifications() {
        try {
            await this.queryInitialHeight();
        } catch (e) {
            console.error(`failed querying initial height`);
        }
        // once we get our initial notifications (or not lol) we can listen for the height values 
        this.dataOutCharacteristic.addEventListener('characteristicvaluechanged', this.onNotification);
        await this.dataOutCharacteristic.startNotifications();
    }

    async stopNotifications() {
        this.dataOutCharacteristic.removeEventListener('characteristicvaluechanged', this.onNotification);
        await this.dataOutCharacteristic.stopNotifications();
    }

    /**
     * TODO: better query here? 
     * @async
     */
    queryInitialHeight() {
        return new Promise((resolve, reject) => {
            // we'll time this out just incase 
            setTimeout(() => reject('never received our query values'), 5000);
            const queryListener = function(event) {
                // TODO: how does this actually work?
                //       some kinda handshake seems to happen before this. don't get 
                //       notifs with just this packet
                // we'll get 3 notifications back, looking for the second (doesnt lead with f2 and is longer than 1)
                // then we can grab current height from 17 and 19
                const notif = toArray(event.target.value);
                console.info(`received initial notification: ${toHexString(event.target.value)}`);
                if (notif[0] !== 0xf2 && notif.length > 1) {
                    window.dispatchEvent(new HeightEvent([notif[17], notif[19]]));
                    lastHeightValues = [notif[17], notif[19]];
                    this.dataOutCharacteristic.removeEventListener('characteristicvaluechanged', queryListener);
                    resolve([notif[17], notif[19]]);
                }
            };
            this.dataInCharacteristic.writeValue(deskQueryPacket);
        })
    }

    onConnected() {
        console.info(`device connected`);
        window.dispatchEvent(new ConnectionEvent(true));
    }

    onDisconnected() {
        console.info(`device disconnected`);
        window.dispatchEvent(new ConnectionEvent(false));
    }

    // TODO: how can we tell notifications apart?
    onNotification(event) {
        console.info(`received notification: ${toHexString(event.target.value)}`);
        const notif = toArray(event.target.value);
        const values = [notif[5], notif[7]];
        window.dispatchEvent(new HeightEvent(values));
        lastHeightValues = values;
    }

    up() {
        this.dataInCharacteristic.writeValue(deskUpPacket.buffer);
    }

    down() {
        this.dataInCharacteristic.writeValue(deskDownPacket.buffer);
    }

    async stand() {
        const interval = setInterval(() => this.up(), directionPacketDelay);
        const waitForValue = (event) => {
            const notif = toArray(event.target.value);
            // TODO: delay in sending/receiving commands. work in some dynamic lag time?
            // looks like my connection overshoots by ~20 so we hardcode that in [[heightNotificaitonDifference]] for now
            if (notif[5] >= standingHeightValues[0] - heightNotificationDifference && notif[7] >= standingHeightValues[1] - heightNotificationDifference) {
                clearInterval(interval);
                this.dataOutCharacteristic.removeEventListener('characteristicvaluechanged', waitForValue);
            }
        }
        this.dataOutCharacteristic.addEventListener('characteristicvaluechanged', waitForValue);
    }

    async sit() {
        const interval = setInterval(() => this.down(), directionPacketDelay);
        const waitForValue = (event) => {
            const notif = toArray(event.target.value);
            // TODO: delay in sending/receiving commands. work in some dynamic lag time?
            // looks like my connection overshoots by ~20 so we hardcode that in [[heightNotificaitonDifference]] for now
            if (notif[5] <= sittingHeightValues[0] + heightNotificationDifference && notif[7] <= sittingHeightValues[1] + heightNotificationDifference) {
                clearInterval(interval);
                this.dataOutCharacteristic.removeEventListener('characteristicvaluechanged', waitForValue);
            }
        }
        this.dataOutCharacteristic.addEventListener('characteristicvaluechanged', waitForValue);
    }
}

async function getDevice() {
    const device = await navigator.bluetooth.requestDevice({
        filters: [
            {services: [serviceUUID]},
        ],
        optionalServices: ['generic_access', 'generic_attribute', 'device_information']
    });
    return device;
}

async function connect() {
    try {
        const device = await getDevice();
        desk = new Desk(device);
        return await desk.connect();
    } catch (e) {
        console.error(`failed to connect to device: ${e}`);
    }
} 

async function disconnect() {
    if (desk && desk.device.gatt.connected) {
        desk.disconnect(); 
    }
    desk = undefined;
}

// TODO: lots of conversions between dataview and array. maybe only 
// convert once then act only on arrays after read...
/**
 * Converts a DataView of Uint8Array to an Array<number>
 * @param {DataView} d 
 * @returns {Array<number>}
 */
function toArray(d) {
    let a = [];
    for (let i = 0; i < d.byteLength; i++) {
        a.push(d.getUint8(i))
    }
    return a;
}

/**
 * Tests whether the given DataView of Uint8Array can be decoded to a "clean" ASCII string.
 * "clean" in this context means it is entirely in the character range 32-126
 * @param {DataView} d
 * @returns {boolean}
 */
function isAsciiString(d) {
    const a = toArray(d);
    for (const b of a) {
        if (b < 32 || b > 126) return false;
    }
    return true;
}

/**
 * Converts a DataView of Uint8Array to a UTF-8 string
 * @param {DataView} d 
 * @returns {string}
 */
function toUTF8(d) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(d);
}

/**
 * Converts a DataView of Uint8Array to a hex string
 * example: [1,2,3] => '010203'
 * @param {DataView} d 
 * @returns {string}
 */
function toHexString(d) {
    return toArray(d).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts a DataView to a UTF-8 string surrounded in quotes if "clean", or a hex string
 * @param {DataView} d 
 * @returns {string}
 */
function toHexOrUTF8(d) {
    if (isAsciiString(d)) return `"${toUTF8(d)}"`;
    return toHexString(d);
}

(function() {
    document.querySelector('#btnServiceDiscovery').addEventListener('click', onDiscoverButtonClick);
    document.querySelector('#btnConnect').addEventListener('click', onConnectClick);
    document.querySelector('#btnDisconnect').addEventListener('click', onDisconnectClick);
    document.querySelector('#btnUp').addEventListener('mousedown', onUpMouseDown);
    document.querySelector('#btnDown').addEventListener('mousedown', onDownMouseDown);
    document.querySelector('#btnStand').addEventListener('click', onStandClick);
    document.querySelector('#btnSit').addEventListener('click', onSitClick);
    document.querySelector('#chxReconnect').addEventListener('change', onReconnectChanged); 
    document.querySelector('#btnSetStand').addEventListener('click', onSetStandClick);
    document.querySelector('#btnSetSit').addEventListener('click', onSetSitClick);
    
    window.addEventListener('connectionchanged', (event) => {
        console.info(`connection event: ${JSON.stringify(event.detail)}`);
        document.querySelector('#btnConnect').disabled = event.detail.connected;
        document.querySelectorAll('#controlContainer button:not(#btnConnect):not([id*="Set"])').forEach((elem) => {
            elem.disabled = !event.detail.connected;
        });
    });

    window.addEventListener('optionschanged', (event) => {
        console.info(`options event: ${JSON.stringify(event.detail)}`);
        document.querySelector('#sStandingHeight').innerText = event.detail.standingHeight.toString();
        document.querySelector('#sSittingHeight').innerText = event.detail.sittingHeight.toString();
        document.querySelector('#chxReconnect').checked = event.detail.reconnect;
    });

    window.addEventListener('heightchanged', (event) => {
        console.info(`height event: ${JSON.stringify(event.detail)}`);
        document.querySelector('#sLastHeight').innerText = event.detail.height.toString();
        lastHeightValues = event.detail.height;
        document.querySelectorAll('#controlContainer button[id*=Set]').disabled = false;
    });

    // TODO: pull from localstorage to dispatch
    window.dispatchEvent(new OptionsEvent(standingHeightValues, sittingHeightValues, automaticallyReconnnect));
})();

async function onDiscoverButtonClick() {
    try {
        const device = await getDevice();
        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();
        for (const service of services) {
            console.group(`Service: ${service.uuid} (${service.isPrimary ? 'is' : 'not'} primary)`);
            const characteristics = await service.getCharacteristics();
            for (const characteristic of characteristics) {
                console.group(`Characteristic: ${characteristic.uuid}`);
                if (characteristic.properties.read) {
                    const v = await characteristic.readValue();
                    console.log(`Value: ${toHexOrUTF8(v)}`);
                }
                console.log(`Read: ${characteristic.properties.read}`);
                console.log(`Write: ${characteristic.properties.write}`);
                console.log(`Write w/o response: ${characteristic.properties.writeWithoutResponse}`);
                console.log(`Notify: ${characteristic.properties.notify}`);
                console.log(`Indicate: ${characteristic.properties.indicate}`);
                console.log(`Broadcast: ${characteristic.properties.broadcast}`);
                console.log(`Signed write: ${characteristic.properties.authenticatedSignedWrites}`);
                console.log(`Queued write: ${characteristic.properties.reliableWrite}`);
                console.log(`Writable auxiliaries: ${characteristic.properties.writableAuxiliaries}`);
                const descriptors = await characteristic.getDescriptors();
                console.group(`Descriptors: `);
                for (const descriptor of descriptors) {
                    const value = await descriptor.readValue();
                    console.log(`${descriptor.uuid} = ${toHexOrUTF8(value)}`);
                }
                console.groupEnd();
                console.groupEnd();
            }
            console.groupEnd();
        }
    } catch (e) {
        console.error(`couldn't do device discovery: ${e}`);
    }
}

function onReconnectChanged() {
    console.info('reconnect doesnt do anything yet lol');
}

async function onConnectClick() {
    try {
        await connect();
    } catch (e) {
        console.error(`couldn't connect to device: ${e}`);
    }
}

async function onDisconnectClick() {
    await disconnect();
}

async function onUpMouseDown() {
    const button = document.querySelector('#btnUp');
    const interval = setInterval(() => {
        desk.up();
    }, directionPacketDelay);
    const onMouseUp = function() {
        clearInterval(interval);
        button.removeEventListener('mouseup', onMouseUp);
    };
    button.addEventListener('mouseup', onMouseUp);
}

async function onDownMouseDown() {
    const button = document.querySelector('#btnDown');
    const interval = setInterval(() => {
        desk.down();
    }, directionPacketDelay);
    const onMouseUp = function() {
        clearInterval(interval);
        button.removeEventListener('mouseup', onMouseUp);
    }
    button.addEventListener('mouseup', onMouseUp);
}

function onStandClick() {
    console.info('moving desk to standing height');
    desk.stand();
}

function onSitClick() {
    console.info('moving desk to sitting height');
    desk.sit();
}

function onSetStandClick() {
    if (!lastHeightValues) {
        console.error('we havent received height values yet, cant set standing height')
        return;
    }
    standingHeightValues = lastHeightValues;
}

function onSetSitClick() {
    if (!lastHeightValues) {
        console.error('we havent received hight values yet, cant set sitting height');
        return;
    }
    sittingHeightValues = lastHeightValues;
}