const serviceUUID = '0000ff12-0000-1000-8000-00805f9b34fb';
const dataInCharacteristicUUID = '0000ff01-0000-1000-8000-00805f9b34fb';
const dataOutCharacteristicUUID = '0000ff02-0000-1000-8000-00805f9b34fb';

const directionPacketDelay = 300; //ms
const deskUpPacket = new Uint8Array([0xf1, 0xf1, 0x01, 0x00, 0x01, 0x7e]);
const deskDownPacket = new Uint8Array([0xf1, 0xf1, 0x02, 0x00, 0x02, 0x7e]);

let desk;

class ConnectionEvent extends CustomEvent {
    constructor(connected) {
        super('connectionchanged', {detail: {connected}});
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
        this.dataOutCharacteristic.addEventListener('characteristicvaluechanged', this.onNotification);
        await this.dataOutCharacteristic.startNotifications();
    }

    async stopNotifications() {
        this.dataOutCharacteristic.removeEventListener('characteristicvaluechanged', this.onNotification);
        await this.dataOutCharacteristic.stopNotifications();
    }

    onConnected() {
        console.info(`device connected`);
        window.dispatchEvent(new ConnectionEvent(true));
    }

    onDisconnected() {
        console.info(`device disconnected`);
        window.dispatchEvent(new ConnectionEvent(false));
    }

    onNotification(event) {
        console.info(`received notification: ${toHexString(event.target.value)}`);
        const notif = toArray(event.target.value);
        console.info(`567: ${notif.slice(5, 8)}, 5: ${notif[5]}, 7: ${notif[7]}`);
    }

    up() {
        this.dataInCharacteristic.writeValue(deskUpPacket.buffer);
    }

    down() {
        this.dataInCharacteristic.writeValue(deskDownPacket.buffer);
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

    window.addEventListener('connectionchanged', () => {
        console.info(`connection event: ${JSON.stringify(event.detail)}`);
        document.querySelector('#btnConnect').disabled = event.detail.connected;
        for (const id of ['#btnDisconnect', '#btnUp', '#btnDown']) {
            document.querySelector(id).disabled = !event.detail.connected;
        }
    });
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
