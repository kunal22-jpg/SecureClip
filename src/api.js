import axios from 'axios';

// REPLACE '192.168.x.x' WITH YOUR REAL IPv4 ADDRESS
const ip = '10.38.138.161'; 

const api = axios.create({
  baseURL: `http://${ip}:5000/api`,
});

export default api;