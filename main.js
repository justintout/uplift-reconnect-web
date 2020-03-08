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

async function connect() {
    const device = await navigator.bluetooth.requestDevice({
        filters: [
            {services: [service]}
        ]
    });
    server = await connect();
} 

async function disconnect() {
    if (desk) {
        desk.disconnect(); 
    }
    desk = undefined;
}

(function() {
    document.querySelector('#btnServiceDiscovery').onClick(onDiscoverButtonClick);
})();