import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const getColor = (avgRisk) => {
    if (avgRisk >= 80) return '#ef4444'; // red-500
    if (avgRisk >= 60) return '#fb923c'; // orange-400
    if (avgRisk >= 40) return '#facc15'; // yellow-400
    return '#22c55e'; // green-500
};

export const CityComparisonMap = ({ cities, onCityClick }) => {
    // Initial center to show India
    const position = [22.0, 78.0];
    const zoom = 5;

    return (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl overflow-hidden shadow-xl h-[420px] md:h-[520px] relative mb-8">
            <h2 className="absolute top-5 left-5 z-[1000] bg-slate-900/90 px-4 py-2.5 rounded-lg border border-slate-700 text-sm font-bold text-white backdrop-blur-md shadow-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                Federated Asset Network
            </h2>
            <MapContainer
                center={position}
                zoom={zoom}
                minZoom={4}
                maxZoom={10}
                style={{ height: '100%', width: '100%', background: '#0f172a' }} // tailwind slate-900
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {cities.map((city, idx) => {
                    const color = getColor(city.average_risk_score);
                    // Radius: base size + extra for critical assets
                    const radius = 14 + (city.critical_count * 5);

                    return (
                        <CircleMarker
                            key={`city-${idx}`}
                            center={[city.lat, city.lng]}
                            radius={radius}
                            pathOptions={{
                                color: color,
                                fillColor: color,
                                fillOpacity: 0.7,
                                weight: 3
                            }}
                            eventHandlers={{
                                click: () => {
                                    if (onCityClick) onCityClick(city.city_id);
                                }
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -10]} opacity={0.95} className="custom-leaflet-tooltip">
                                <div className="p-2 min-w-[160px]">
                                    <h3 className="font-bold text-slate-800 mb-1.5 border-b border-slate-300 pb-1 text-base">{city.city_name}</h3>
                                    <p className="text-xs font-semibold mb-1">Avg Risk: <span className="font-bold" style={{ color }}>{city.average_risk_score.toFixed(1)}</span></p>
                                    <p className="text-xs">Critical Assets: <span className="text-red-600 font-bold">{city.critical_count}</span></p>
                                    <p className="text-xs text-slate-600 mt-1 italic">Click to view details</p>
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
        </div>
    );
};
