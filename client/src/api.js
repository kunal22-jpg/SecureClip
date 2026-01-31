import axios from 'axios';

const api = axios.create({
  baseURL: 'https://secure-clip-server.onrender.com/api', 
});

export default api;
