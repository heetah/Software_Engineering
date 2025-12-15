// Weather API configuration
// NOTE: Replace with your OpenWeatherMap API key
// Get free API key at: https://openweathermap.org/api
const API_KEY = 'YOUR_API_KEY_HERE';
const API_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Weather icon mapping
const weatherIcons = {
    '01d': '☀️', '01n': '🌙',
    '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '❄️', '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️'
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEnterKey();
    // Load default city (optional)
    // searchWeather('London');
});

// Search weather by city name
async function searchWeather(cityName) {
    const input = document.getElementById('cityInput');
    const city = cityName || input.value.trim();

    if (city === '') {
        showError('Please enter a city name');
        return;
    }

    showLoading();

    try {
        const data = await fetchWeatherData(city);
        displayWeather(data);
    } catch (error) {
        showError(error.message);
    }
}

// Fetch weather data from API
async function fetchWeatherData(city) {
    const url = `${API_URL}?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;

    // Mock data for demonstration (remove when using real API)
    if (API_KEY === 'YOUR_API_KEY_HERE') {
        return getMockWeatherData(city);
    }

    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('City not found. Please check the spelling.');
        } else if (response.status === 401) {
            throw new Error('Invalid API key. Please check your configuration.');
        } else {
            throw new Error('Failed to fetch weather data. Please try again.');
        }
    }

    return await response.json();
}

// Display weather data
function displayWeather(data) {
    document.getElementById('cityName').textContent = data.name;
    document.getElementById('country').textContent = data.sys.country;
    document.getElementById('temp').textContent = Math.round(data.main.temp);
    document.getElementById('weatherDesc').textContent = data.weather[0].description;
    document.getElementById('humidity').textContent = `${data.main.humidity}%`;
    document.getElementById('windSpeed').textContent = `${data.wind.speed} m/s`;
    document.getElementById('feelsLike').textContent = `${Math.round(data.main.feels_like)}°C`;

    const iconCode = data.weather[0].icon;
    document.getElementById('weatherIcon').textContent = weatherIcons[iconCode] || '🌤️';

    hideLoading();
    hideError();
    showWeatherDisplay();
}

// Show/hide elements
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('weatherDisplay').style.display = 'none';
    document.getElementById('error').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('error').style.display = 'block';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('weatherDisplay').style.display = 'none';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

function showWeatherDisplay() {
    document.getElementById('weatherDisplay').style.display = 'block';
}

// Setup Enter key to search
function setupEnterKey() {
    const input = document.getElementById('cityInput');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchWeather();
        }
    });
}

// Mock data for demonstration purposes
function getMockWeatherData(city) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                name: city,
                sys: { country: 'US' },
                main: {
                    temp: 22,
                    feels_like: 20,
                    humidity: 65
                },
                weather: [{
                    description: 'partly cloudy',
                    icon: '02d'
                }],
                wind: { speed: 3.5 }
            });
        }, 1000);
    });
}
