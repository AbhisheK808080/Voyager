import React, { useState, useEffect, useRef } from 'react';
import { Send, Plane } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Message {
  text: string;
  isBot: boolean;
  attractions?: Place[];
  food?: Place[];
  itinerary?: string[];
  weather?: any[];
}
interface Place {
  name: string;
  categories: string[];
  formatted: string;
  place_id: string;
  lat?: number;
  lon?: number;
}

interface Location {
  lat: number;
  lon: number;
}

const ChangeMapView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
};

async function fetchLocationCoordinates(destination: string): Promise<Location | null> {
  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(destination)}&format=json&apiKey=${import.meta.env.VITE_GEOAPIFY_API_KEY}`
    );
    const data = await response.json();
    if (data.results?.length) {
      const result = data.results[0];
      return { lat: result.lat, lon: result.lon };
    }
    return null;
  } catch (error) {
    console.error('Error fetching location:', error);
    return null;
  }
}

async function fetchPlaces(location: Location, category: string, days: number): Promise<Place[]> {
  try {
    const response = await fetch(
      `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${location.lon},${location.lat},5000&limit=${days * 5}&apiKey=${import.meta.env.VITE_GEOAPIFY_API_KEY}`
    );
    const data = await response.json();
    return data.features.map((feature: any) => ({
      name: feature.properties.name || 'Unnamed Place',
      categories: feature.properties.categories || [],
      formatted: feature.properties.formatted || '',
      place_id: feature.properties.place_id,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0]
    }));
  } catch (error) {
    console.error('Error fetching places:', error);
    return [];
  }
}


function generateItinerary(attractions: Place[], food: Place[], days: number): string[] {
  const itinerary: string[] = [];

  const perDayAttractions = Math.min(3, Math.ceil(attractions.length / days));
  const perDayFood = Math.min(3, Math.ceil(food.length / days));

  for (let i = 0; i < days; i++) {
    const dayAttractions = attractions.slice(i * perDayAttractions, (i + 1) * perDayAttractions);
    const dayFood = food.slice(i * perDayFood, (i + 1) * perDayFood);

    const morning = dayAttractions[0]?.name || 'Explore local neighborhood';
    const afternoon = dayAttractions[1]?.name || 'Relax at a nearby café or park';
    const lunch = dayFood[0]?.name || 'Local street food';
    const dinner = dayFood[1]?.name || 'Try a local restaurant';
    const evening = dayAttractions[2]?.name || " Take a walk or catch a local event";
    itinerary.push(
      `
    🌅 Morning: Visit ${morning}
    🍽️ Lunch: Enjoy at ${lunch}
    🏞️ Afternoon: Head to ${afternoon}
    🍴 Dinner: Dine at ${dinner}
    🌙 Evening: Visit ${evening}`
    );
  }

  return itinerary;
}
interface WeatherDay {
  date: string;
  condition: string;
  icon: string;
  temp: number;
  humidity: number;
}

async function fetchWeatherForecast(lat: number, lon: number, days: number): Promise<WeatherDay[]> {
  try {
    const response = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${import.meta.env.VITE_WEATHERAPI_KEY}&q=${lat},${lon}&days=${days}`);
    const data = await response.json();
    return data.forecast.forecastday.map((day: any) => ({
      date: day.date,
      condition: day.day.condition.text,
      icon: day.day.condition.icon,
      temp: day.day.avgtemp_c,
      humidity: day.day.avghumidity
    }));
  } catch (error) {
    console.error('Error fetching weather:', error);
    return [];
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([{
    text: "Hello! I'm your travel assistant. Where would you like to go?",
    isBot: true
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<'destination' | 'days'>('destination');
  const [destination, setDestination] = useState('');
  const [tripDays, setTripDays] = useState<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    const userMessage: Message = { text: input, isBot: false };
    setMessages(prev => [...prev, userMessage]);

    if (step === 'destination') {
      const location = await fetchLocationCoordinates(input);
      if (location) {
        setDestination(input);
        setCurrentLocation(location);
        setStep('days');
        setInput('');
        setMessages(prev => [...prev, {
          text: `Great! How many days will you be staying in ${input}?`,
          isBot: true
        }]);
      } else {
        setMessages(prev => [...prev, {
          text: "I couldn't find that location. Please try again with a different destination.",
          isBot: true
        }]);
        setInput('');
      }
    } else if (step === 'days') {
      const days = parseInt(input.trim());
      if (isNaN(days) || days <= 0) {
        setMessages(prev => [...prev, {
          text: "Please enter a valid number of days (e.g., 3, 5, 7).",
          isBot: true
        }]);
        setInput('');
        setIsLoading(false);
        return;
      }

      setTripDays(days);
      setInput('');

      try {
        const location = currentLocation!;
        const [attractions, food] = await Promise.all([
          fetchPlaces(location, 'tourism.sights,tourism.attraction', days),
          fetchPlaces(location, 'catering.restaurant,catering.fast_food', days)
        ]);

        const itinerary = generateItinerary(attractions, food, days);
        setAllPlaces([...attractions, ...food]);
        const weather = await fetchWeatherForecast(location.lat, location.lon, days);
        const botMessage: Message = {
          text: `Here's your travel plan for ${destination}!`,
          isBot: true,
          attractions,
          food,
          itinerary,
          weather
        };

        setMessages(prev => [...prev, botMessage]);
        setStep('destination');
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => [...prev, {
          text: "Sorry, something went wrong. Try again later.",
          isBot: true
        }]);
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-purple-300 via-blue-100 to-blue-300 p-4 flex items-center justify-center">
      <div className="bg-white border rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col md:flex-row overflow-hidden">
        {/* Chat Section */}
        <div className="md:w-1/2 w-full flex flex-col border-r">
          <div className="bg-blue-600 p-4 flex items-center gap-2">
            <Plane className="text-white" size={24} />
            <h1 className="text-xl font-semibold text-white">Voyager! Your Travel Assistant</h1>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${message.isBot ? 'bg-gray-100 text-gray-800' : 'bg-blue-600 text-white'}`}>
                  <pre className="whitespace-pre-wrap font-sans">{message.text}</pre>

                  {message.attractions && (
                    <>
                      <h4 className="mt-2 font-bold text-blue-700">Attractions:</h4>
                      {message.attractions.map(place => (
                        <div key={place.place_id} className="p-2 text-sm border-b">
                          <strong>{place.name}</strong><br />
                          <span>{place.formatted}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {message.food && (
                    <>
                      <h4 className="mt-3 font-bold text-green-700">Food Places:</h4>
                      {message.food.map(place => (
                        <div key={place.place_id} className="p-2 text-sm border-b">
                          <strong>{place.name}</strong><br />
                          <span>{place.formatted}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {message.weather && message.weather.length > 0 && (
                    <>
                      <h4 className="mt-6 text-lg font-semibold text-yellow-700">☀️ 5-Day Weather Forecast</h4>
                      <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                        {message.weather.map((day: any, i: number) => (
                          <div key={i} className="bg-yellow-50 p-3 rounded border flex gap-3 items-center">
                            <img
                              src={`https:${day.icon}`}
                              alt={day.condition}
                              className="w-10 h-10"
                            />
                            <div>
                              <p><strong>{new Date(day.date).toLocaleDateString()}</strong></p>
                              <p>{day.condition}</p>
                              <p>🌡️ {day.temp}°C</p>
                              <p>💧 {day.humidity}% humidity</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {message.itinerary && (
                    <>
                      <h4 className="mt-6 text-2xl font-semibold text-purple-800 flex items-center gap-2">
                        <span className="inline-block bg-purple-100 text-purple-600 px-2 py-1 rounded text-sm">Itinerary</span>
                        Suggested Plan
                      </h4>

                      <div className="mt-4 grid gap-6 sm:grid-cols-1 ">
                        {message.itinerary.map((dayPlan, i) => (
                          <div
                            key={i}
                            className="bg-white border border-purple-200 rounded-xl shadow-md p-5 transition-all hover:shadow-lg"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                                {i + 1}
                              </div>
                              <h5 className="text-lg font-semibold text-purple-700">Day {i + 1}</h5>
                            </div>
                            <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed font-sans">
                              {dayPlan}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-200 p-3 rounded-lg animate-pulse">Typing...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t bg-gray-50">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Ask about a destination..."
                className="flex-1 resize-none rounded-lg border border-gray-300 p-2 focus:outline-none focus:border-blue-500"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg"
                disabled={isLoading}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <div className="md:w-1/2 w-full h-64 md:h-full relative">
          {currentLocation ? (
            <MapContainer center={[currentLocation.lat, currentLocation.lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <ChangeMapView center={[currentLocation.lat, currentLocation.lon]} />
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {allPlaces.map(p => p.lat && p.lon && (
                <Marker key={p.place_id} position={[p.lat, p.lon]}>
                  <Popup>
                    <strong>{p.name}</strong><br />{p.formatted}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <p className="text-gray-500 text-center px-4">Search for a destination to see the map</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
