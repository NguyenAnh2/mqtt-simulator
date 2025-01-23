import { connect } from 'mqtt';
import { randomBytes, randomUUID } from 'crypto';
import xlsx from 'xlsx';
import axios from 'axios'; // For adding devices via API

// MQTT Broker URL
const brokerUrl = 'mqtt://mqtt.vgps.vn:1883';

// MQTT Client Configuration
const client = connect(brokerUrl, {
    clientId: `vgps-be-development`,
    username: 'app@VGPS',
    password: 'test@VGPS',
    reconnectPeriod: 10000,
    keepalive: 60,
    clean: true,
});

const TOKEN = 'ADD TOKEN HERE'
const apiUrl = 'https://uat-core.vgps.vn/api/devices'
const apiActivateUrl = 'https://uat-core.vgps.vn/api/devices/active'
// Helper functions
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(6));

// Read and write Excel
const excelFilePath = './device_data.xlsx';
function readExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // First sheet
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    console.log('Excel Data:', data); // Log dữ liệu đọc từ Excel
    return {
        workbook,
        data,
        sheetName,
    };
}


function writeExcel(filePath, workbook) {
    xlsx.writeFile(workbook, filePath);
}


// Hàm tạo dữ liệu thêm thiết bị
function createDeviceData(serial) {
    return {
        device_type_id: Math.floor(Math.random() * 4) + 1, // Ngẫu nhiên từ 1 đến 4
        serial: String(serial), // Ép kiểu serial thành string
        hardware_version: '1.0', // Mặc định
        date_of_manufacture: new Date().toISOString(), // Thời điểm hiện tại
    };
}

// Hàm tạo dữ liệu kích hoạt thiết bị
function createActivationData(serial, titleDeviceType, licensePlate = null) {
    const phone = '0333703607';
    const fullName = 'Nguyễn Văn Test';
    const version = '1.0';
    const servicePackage = '1';
    let slots = null;
    let tonnage = null;
    let nameOfUserForGps = null;

    switch (titleDeviceType) {
        case 'Xe máy':
        case 'Xe ô tô con':
            break;
        case 'Xe khách':
            slots = Math.floor(Math.random() * 10) + 1; // Ngẫu nhiên từ 1 đến 10
            break;
        case 'Xe tải':
            tonnage = `${Math.floor(Math.random() * 5) + 1} tấn`; // Ngẫu nhiên từ 1 đến 5 tấn
            break;
    }

    return {
        phone,
        full_name: fullName,
        serial: String(serial),
        vehicle_license_plate: String(licensePlate),
        version,
        title_device_type: String(titleDeviceType),
        slots,
        tonnage,
        name_of_user_for_gps: nameOfUserForGps,
        service_package: servicePackage,
    };
}

// Publish ACTIVATE message and update Excel
function sendActivateMessage(serial, plate, device, workbook, sheetName) {
    const activateTopic = `TRACKER/AUTO/${serial}/ACTIVATE`;
    const secretKey = randomBytes(16).toString('hex');

    const activationMessage = {
        100: Math.floor(Date.now() / 1000), // Unix timestamp
        110: randomUUID(),
        111: 1,
        data: {
            200: secretKey,
            201: plate,
            350: 2550,
            351: randomNumber(0, 2),
            352: randomNumber(50, 80),
            353: Math.floor(Date.now() / 1000),
            354: randomNumber(3, 10),
            355: randomNumber(3, 10),
            356: randomNumber(0, 1),
            357: randomNumber(60, 180),
            358: randomNumber(600, 1800),
            359: randomNumber(1, 4),
        },
    };

    client.publish(activateTopic, JSON.stringify(activationMessage), { qos: 0 });
    console.log(`Sent ACTIVATE message to ${activateTopic}`);

    // Update Excel with secret key
    device.key = secretKey; // Add 'key' field to device
    const updatedSheet = xlsx.utils.json_to_sheet(workbook.data, { skipHeader: false });
    workbook.workbook.Sheets[sheetName] = updatedSheet;
    writeExcel(excelFilePath, workbook.workbook);
    console.log(`Updated secret key for ${serial} in Excel`);
}

// Hàm thêm thiết bị
async function addDevice(data) {
    try {
        const response = await axios.post(apiUrl, data, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${TOKEN}`, // Thay bằng token thực tế
            },
        });
        console.log(`Added device with serial: ${data.serial}`);
        return response.data;
    } catch (error) {
        console.error(`Failed to add device ${data.serial}:`, error.response?.data || error.message);
        return null;
    }
}

// Hàm kích hoạt thiết bị
async function activateDevice(data) {
    try {
        const response = await axios.post(apiActivateUrl, data, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${TOKEN}`, // Thay bằng token thực tế
            },
        });
        console.log(`Activated device with serial: ${data.serial}`);
        return response.data;
    } catch (error) {
        console.error(`Failed to activate device ${data.serial}:`, error.response?.data || error.message);
        return null;
    }
}

async function run() {
    const devices = readExcel(excelFilePath); // Đọc danh sách từ Excel
    const deviceTypes = ['Xe máy', 'Xe khách', 'Xe tải', 'Xe ô tô con'];
    for (const device of devices.data) {
        const { serial, plate: licensePlate } = device;

        // Bước 1: Thêm thiết bị
        const deviceData = createDeviceData(serial);
        const addResult = await addDevice(deviceData);

        if (addResult) {
            console.log(`Device ${serial} added successfully.`);

            // Bước 2: Tạo dữ liệu kích hoạt
            const titleDeviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
            const activationData = createActivationData(serial, titleDeviceType, licensePlate);

            // Bước 3: Kích hoạt thiết bị
            const activateResult = await activateDevice(activationData);

            if (activateResult) {
                console.log(`Device ${serial} activated successfully.`);
            } else {
                console.error(`Failed to activate device ${serial}.`);
            }
        } else {
            console.error(`Failed to add device ${serial}.`);
        }
    }
}


run().catch((err) => console.error('Unexpected error:', err));

// Publish PERIODIC, EVENT, INFO messages
function sendPeriodicMessage(serial, plate) {
    const periodicTopic = `TRACKER/AUTO/${serial}/PERIODIC`;
    const periodicMessage = {
        100: Math.floor(Date.now() / 1000),
        111: 1,
        data: {
            201: plate,
            253: randomNumber(0, 5),
            254: [randomFloat(8, 23), randomFloat(102, 109)],
            255: randomFloat(0, 360),
            256: randomNumber(20, 100),
            257: randomNumber(0, 1),
            258: randomNumber(0, 1),
            259: randomNumber(0, 1),
            260: randomNumber(0, 1),
            261: randomNumber(0, 100),
            265: randomNumber(0, 100),
            266: randomFloat(20, 40),
        },
    };

    client.publish(periodicTopic, JSON.stringify(periodicMessage), { qos: 0 });
    console.log(`Sent PERIODIC message to ${periodicTopic}`);
}

function sendEventMessage(serial) {
    const eventTopic = `TRACKER/AUTO/${serial}/EVENT`;
    const eventNumbers = [...Array(7).keys()].map(i => i + 1).concat([...Array(7).keys()].map(i => i + 21));
    const selectedEventNumber = eventNumbers[Math.floor(Math.random() * eventNumbers.length)];

    const eventMessage = {
        100: Math.floor(Date.now() / 1000),
        111: selectedEventNumber,
        110: randomUUID(),
        data: {
            202: randomBytes(8).toString('hex'),
            203: 'NGUYEN VAN A',
            261: randomNumber(100, 120),
            352: randomNumber(80, 120),
            254: [randomFloat(0, 90), randomFloat(0, 180)],
        },
    };

    client.publish(eventTopic, JSON.stringify(eventMessage), { qos: 0 });
    console.log(`Sent EVENT message to ${eventTopic} with event 111: ${selectedEventNumber}`);
}

function sendInfoMessage(serial, plate) {
    const infoTopic = `TRACKER/AUTO/${serial}/INFO`;

    const infoMessage = {
        100: Math.floor(Date.now() / 1000),
        201: plate,
        250: serial,
        251: 'viettel',
        252: `098${randomNumber(1000000, 9999999)}`,
        253: randomNumber(0, 5),
        301: '1.0.0',
        302: `tracker_${randomBytes(3).toString('hex')}`,
    };

    client.publish(infoTopic, JSON.stringify(infoMessage), { qos: 0 });
    console.log(`Sent INFO message to ${infoTopic}`);
}

// Simulate device messages
function simulateDevice(serial, plate, device, workbook, sheetName) {
    // if (!device.key) {
    //     sendActivateMessage(serial, plate, device, workbook, sheetName);
    // }

    setInterval(() => sendPeriodicMessage(serial, plate), 10000);
    setInterval(() => sendEventMessage(serial), randomNumber(10000, 15000));
    setInterval(() => sendInfoMessage(serial, plate), randomNumber(15000, 20000));
}

// MQTT Connection
client.on('connect', async () => {
    console.log('Connected to MQTT broker');

    const { workbook, data, sheetName } = readExcel(excelFilePath);

    for (const device of data) {
        const { serial, plate } = device;
        if (serial && plate) {
            await addDevice(serial, plate);
            simulateDevice(serial, plate, device, { workbook, data }, sheetName);
        } else {
            console.warn('Invalid device data:', device);
        }
    }
});

client.on('error', (err) => {
    console.error('MQTT Connection Error:', err.message);
});
