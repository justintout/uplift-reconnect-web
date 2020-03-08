const serviceUUID = '0000ff12-0000-1000-8000-008005f9b34fb';
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
    return new Promise((resolve, reject) => {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    {services: [service]}
                ]
            });
            desk = new Desk(device);
            await desk.connect();
            resolve();
        } catch (e) {
            reject(e);
        }
    });
} 

async function disconnect() {
    if (desk) {
        desk.disconnect(); 
    }
    desk = undefined;
}

(function() {
    document.querySelector('#btnServiceDiscovery').addEventListener('click', onDiscoverButtonClick);
    disconnect.querySelector('#btnConnect').addEventListener('click', onConn)
})();

async function onDiscoverButtonClick() {
    alert('Check the console for info');

    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                {services: [service]}
            ]
        });
        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();
        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            for (const characteristic of characteristics) {
                console.log(JSON.stringify(characteristic));
            }
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

}