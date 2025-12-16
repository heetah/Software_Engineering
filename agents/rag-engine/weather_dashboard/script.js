// Mock Data
const weatherData = {
    "taipei": {
        city: "Taipei, TW",
        temp: 24,
        condition: "Cloudy",
        humidity: "78%",
        wind: "15 km/h",
        pressure: "1012 hPa",
        icon: "fa-cloud",
        forecast: [
            { day: "Tue", icon: "fa-cloud-rain", temp: "22°C" },
            { day: "Wed", icon: "fa-cloud", temp: "23°C" },
            { day: "Thu", icon: "fa-sun", temp: "26°C" },
            { day: "Fri", icon: "fa-sun", temp: "27°C" },
            { day: "Sat", icon: "fa-cloud-sun", temp: "25°C" }
        ]
    },
    "tokyo": {
        city: "Tokyo, JP",
        temp: 12,
        condition: "Rainy",
        humidity: "85%",
        wind: "20 km/h",
        pressure: "1008 hPa",
        icon: "fa-umbrella",
        forecast: [
            { day: "Tue", icon: "fa-cloud-showers-heavy", temp: "11°C" },
            { day: "Wed", icon: "fa-cloud", temp: "13°C" },
            { day: "Thu", icon: "fa-sun", temp: "15°C" },
            { day: "Fri", icon: "fa-cloud-sun", temp: "14°C" },
            { day: "Sat", icon: "fa-sun", temp: "16°C" }
        ]
    },
    "london": {
        city: "London, UK",
        temp: 8,
        condition: "Foggy",
        humidity: "90%",
        wind: "10 km/h",
        pressure: "1020 hPa",
        icon: "fa-smog",
        forecast: [
            { day: "Tue", icon: "fa-cloud", temp: "9°C" },
            { day: "Wed", icon: "fa-cloud-rain", temp: "8°C" },
            { day: "Thu", icon: "fa-wind", temp: "7°C" },
            { day: "Fri", icon: "fa-cloud-sun", temp: "10°C" },
            { day: "Sat", icon: "fa-sun", temp: "11°C" }
        ]
    },
    "new york": {
        city: "New York, US",
        temp: 5,
        condition: "Clear",
        humidity: "40%",
        wind: "25 km/h",
        pressure: "1018 hPa",
        icon: "fa-sun",
        forecast: [
            { day: "Tue", icon: "fa-sun", temp: "6°C" },
            { day: "Wed", icon: "fa-cloud-sun", temp: "8°C" },
            { day: "Thu", icon: "fa-snowflake", temp: "2°C" },
            { day: "Fri", icon: "fa-snowflake", temp: "0°C" },
            { day: "Sat", icon: "fa-sun", temp: "4°C" }
        ]
    }
};

// DOM Elements
const searchBtn = document.getElementById('search-btn');
const cityInput = document.getElementById('city-input');
const errorMessage = document.getElementById('error-message');
const weatherContent = document.getElementById('weather-content');

// Elements to update
const cityNameEl = document.getElementById('city-name');
const currentDateEl = document.getElementById('current-date');
const tempEl = document.getElementById('temperature');
const conditionEl = document.getElementById('condition');
const mainIconEl = document.getElementById('main-icon');
const windEl = document.getElementById('wind-speed');
const humidityEl = document.getElementById('humidity');
const pressureEl = document.getElementById('pressure');
const forecastGrid = document.getElementById('forecast-grid');

// Event Listeners
searchBtn.addEventListener('click', () => {
    const city = cityInput.value.toLowerCase().trim();
    updateWeather(city);
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const city = cityInput.value.toLowerCase().trim();
        updateWeather(city);
    }
});

// Init
updateWeather('taipei');

// Functions
function updateWeather(cityKey) {
    const data = weatherData[cityKey];

    if (data) {
        // Hide error, show content
        errorMessage.style.display = 'none';
        weatherContent.style.opacity = '1';

        // Update Current Weather
        cityNameEl.textContent = data.city;
        currentDateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
        tempEl.textContent = data.temp;
        conditionEl.textContent = data.condition;
        windEl.textContent = data.wind;
        humidityEl.textContent = data.humidity;
        pressureEl.textContent = data.pressure;

        // Update Icon class
        mainIconEl.className = `fas ${data.icon}`;

        // Update Forecast
        forecastGrid.innerHTML = data.forecast.map(day => `
            <div class="forecast-card">
                <span class="forecast-day">${day.day}</span>
                <i class="fas ${day.icon}"></i>
                <span class="forecast-temp">${day.temp}</span>
            </div>
        `).join('');

    } else {
        // Show error
        errorMessage.style.display = 'block';
        // Optional: clear content or keep last valid
    }
}
