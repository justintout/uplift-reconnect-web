const serviceUUID = '0000ff12-0000-1000-8000-00805f9b34fb';
const dataInCharacteristicUUID = '0000ff01-0000-1000-8000-008005f9b34fb';
const dataOutCharacteristicUUID = '0000ff02-0000-1000-8000-008005f9b34fb';

const directionPacketDelay = 3000; //ms
const deskUpPacket = new Uint8Array([0xf1, 0xf1, 0x01, 0x00, 0x01, 0x7e]);
const deskDownPacket = new Uint8Array([0xf1, 0xf1, 0x02, 0x00, 0x02, 0x7e]);

let desk;

class Desk {
    
    constructor(device) {
        this.device = device;
    }
    
    async connect() {
        this.server = await this.device.gatt.connect(); 
        this.service = device.getService(serviceUUID);
        this.dataInCharacteristic = this.service.getCharacteristic(dataInCharacteristicUUID);
        this.dataOutCharacteristic = this.service.getCharacteristic(dataOutcharacteristicUUID);
    }

    up() {
        this.dataInCharacteristic.writeValue(deskUpPacket.buffer);
    }

    down() {
        this.dataInCharacteristic.writeValue(deskDownPacket.buffer);
    }
}

async function connect() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                {services: [service]}
            ]
        });
        desk = new Desk(device);
        return await desk.connect();
    } catch (e) {
        console.error(`failed to connect to device: ${e}`);
    }
} 

async function disconnect() {
    if (desk) {
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
    document.querySelector('#btnDisconnect').addEventListener('click', onConnectClick);
    document.querySelector('#btnUp').addEventListener('mousedown', onUpMouseDown);
    document.querySelector('#btnDown').addEventListener('mousedown', onDownMouseDown);
})();


async function onDiscoverButtonClick() {
    alert('Check the console for info');

    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                {services: [serviceUUID]}
            ]
        });
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
        document.querySelector('#btnConnect').disabled = true;
        await connect();
        for (const id of ['#btnDisconnect', '#btnUp', '#btnDown']) {
            document.querySelector(id).disabled = false;
        }
    } catch (e) {
        document.querySelector('#btnConnect').disabled = false;
        for (const id of ['#btnDisconnect', '#btnUp', '#btnDown']) {
            document.querySelector(id).disabled = true;
        }
        console.error(`couldn't connect to device: ${e}`);
    }
}

async function onDisconnectClick() {
    await discnonect();
}

async function onUpMouseDown() {
    const button = document.querySelector('#btnUp');
    const interval = setInterval(() => {
        desk.up();
    }, directionPacketDelay);
    const onMouseUp = function() {
        clearInterval(interval);
        button.removeEventListener(onMouseUp);
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
        button.removeEventListener(onMouseUp);
    }
    button.addEventListener('mouseup', onMouseUp);
}
