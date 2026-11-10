// Genera el snippet de consola que carga el INGLÉS (botón ES | EN) en la versión
// ACTIVA del cuestionario "Encuesta AGA - Pasajeros", sin crear una versión nueva.
//
// La traducción se aplica por DICCIONARIO (texto en español → inglés): sirve aunque
// la versión activa de producción tenga otro orden o más preguntas que la local. Lo
// que no esté en el diccionario queda en español y el snippet lo lista en la consola.
//
// Base: traducción validada del PMC v2 (2026-11-10) + textos propios de esta encuesta.
//
// Uso:
//   OUT_DIR=<carpeta> node scripts/traducir-aga-pasajeros-en.mjs
// Escribe <OUT_DIR>/aga-pasajeros-traducir-en-produccion.js

import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = process.env.OUT_DIR || ".";
const TITLE = "Encuesta AGA - Pasajeros";
const TITLE_EN = "AGA Survey – Passengers";

// Las secciones "X — evaluación" se traducen como "<X en inglés> — rating".
const SECTIONS = {
  "Registro del vuelo (agente)": "Flight details (agent)",
  "Registro del vuelo": "Flight details",
  "Experiencia general del aeropuerto": "Overall airport experience",
  "Baños": "Restrooms",
  "Tiendas y comercio": "Shops and retail",
  "Comidas y bebidas": "Food and beverages",
  "Check-in": "Check-in",
  "Transporte al aeropuerto": "Getting to the airport",
  "Estacionamiento": "Parking",
  "Wi-Fi": "Wi-Fi",
  "Salón VIP": "VIP lounge",
  "Retiro de equipaje": "Baggage claim",
  "Accesibilidad": "Accessibility",
  "Lo más importante para usted": "What matters most to you",
  "Perfil del pasajero": "Passenger profile",
  "Turismo regional (opcional)": "Regional tourism (optional)",
};

// Validada con el PMC v2 (2026-11-10).
const APPROVED = {
  "Aerolínea": "Airline",
  "JetSMART - JA": "JetSMART - JA",
  "Número de vuelo": "Flight number",
  "Destino": "Destination",
  "¿Qué tan probable es que recomiende este aeropuerto a un amigo o familiar? (0 = nada probable, 10 = muy probable)":
    "How likely are you to recommend this airport to a friend or family member? (0 = not at all likely, 10 = extremely likely)",
  "Satisfacción general con el aeropuerto en su visita de hoy": "Overall satisfaction with the airport on today's visit",
  "Facilidad de su paso por el aeropuerto (rápido y simple)": "Ease of getting through the airport (quick and simple)",
  "Limpieza general del terminal": "Overall cleanliness of the terminal",
  "Sensación de seguridad dentro del recinto": "Feeling of safety and security inside the airport",
  "Señalética y facilidad para orientarse": "Signage and ease of finding your way",
  "Confort del terminal (asientos, temperatura y ambiente)": "Terminal comfort (seating, temperature and ambience)",
  "Tiempo de espera en el control de seguridad": "Waiting time at security screening",
  "Amabilidad y disposición del personal del aeropuerto": "Courtesy and helpfulness of airport staff",
  "Variedad y disponibilidad de comidas y comercio": "Range and availability of food and shops",
  "Información de vuelos (pantallas y anuncios)": "Flight information (screens and announcements)",
  "¿Usó los baños del aeropuerto?": "Did you use the airport restrooms?",
  "Sí": "Yes",
  "No": "No",
  "Aseo e higiene de los baños": "Cleanliness and hygiene of the restrooms",
  "Estado de las instalaciones y artefactos": "Condition of the facilities and fixtures",
  "Disponibilidad de insumos (jabón y papel)": "Availability of supplies (soap and paper)",
  "¿Compró o recorrió tiendas del aeropuerto?": "Did you shop or browse in the airport stores?",
  "Amabilidad y rapidez en la atención": "Courtesy and speed of service",
  "Variedad y calidad de los productos": "Range and quality of products",
  "Relación precio–calidad": "Value for money",
  "¿Consumió en cafeterías o servicios de comida?": "Did you buy anything at the cafés or food outlets?",
  "Calidad de los productos": "Quality of the food and drinks",
  "¿Realizó check-in en el aeropuerto (mesón o kiosko)?": "Did you check in at the airport (counter or kiosk)?",
  "Tiempo de espera para el check-in": "Waiting time at check-in",
  "Amabilidad del personal": "Courtesy of the check-in staff",
  "Eficiencia del proceso": "Efficiency of the process",
  "Para llegar al aeropuerto, ¿usó transporte público o de acercamiento?":
    "To get to the airport, did you use public transport or a shuttle service?",
  "Disponibilidad del transporte": "Availability of transport",
  "Puntualidad del transporte": "Punctuality of transport",
  "¿Usó el estacionamiento del aeropuerto?": "Did you use the airport parking?",
  "Disponibilidad de espacios": "Availability of parking spaces",
  "Seguridad del recinto": "Safety and security of the parking area",
  "¿Usó el Wi-Fi del aeropuerto?": "Did you use the airport Wi-Fi?",
  "Facilidad para conectarse": "Ease of connecting",
  "Velocidad de navegación": "Browsing speed",
  "¿Usó el Salón VIP (CIP)?": "Did you use the VIP lounge?",
  "Amabilidad en la atención": "Courtesy of service",
  "Confort y ambiente del salón": "Comfort and ambience of the lounge",
  "Variedad y calidad de los servicios": "Range and quality of services",
  "¿Retiró equipaje en este aeropuerto?": "Did you collect checked baggage at this airport?",
  "Tiempo de entrega del equipaje": "Baggage delivery time",
  "Estado y ambiente de la sala de retiro": "Condition and ambience of the baggage claim area",
  "¿Requiere facilidades de movilidad reducida?": "Do you require assistance for reduced mobility?",
  "Satisfacción con las facilidades para movilidad reducida":
    "Satisfaction with the facilities for passengers with reduced mobility",
  "De la siguiente lista, marque los 3 aspectos MÁS importantes para usted en un aeropuerto (máximo 3)":
    "From the list below, select the 3 aspects that are MOST important to you in an airport (maximum 3)",
  "Limpieza": "Cleanliness",
  "Seguridad": "Safety and security",
  "Tiempos de espera": "Waiting times",
  "Señalética y orientación": "Signage and wayfinding",
  "Confort y asientos": "Comfort and seating",
  "Personal amable": "Friendly staff",
  "Comida y comercio": "Food and shops",
  "Información de vuelos": "Flight information",
  "Transporte y acceso": "Transport and access",
  "¿Qué es lo que MÁS valoró de su experiencia hoy?": "What did you value MOST about your experience today?",
  "Si pudiera cambiar UNA sola cosa para mejorar su paso por el aeropuerto, ¿cuál sería?":
    "If you could change just ONE thing to improve your time at the airport, what would it be?",
  "Motivo principal de su viaje": "Main purpose of your trip",
  "Placer / turismo": "Leisure / tourism",
  "Trabajo / negocios": "Work / business",
  "Visita a familiares": "Visiting family",
  "Estudios": "Studies",
  "Salud": "Health / medical",
  "Congreso o evento": "Conference or event",
  "¿Con qué frecuencia viaja en avión?": "How often do you fly?",
  "Es mi primera vez / casi nunca": "This is my first time / hardly ever",
  "1 a 4 veces al año": "1 to 4 times a year",
  "5 a 9 veces al año": "5 to 9 times a year",
  "10 o más veces al año": "10 or more times a year",
  "¿Dónde reside?": "Where do you live?",
  "En la Región de Los Lagos": "In the Los Lagos Region",
  "En otra región de Chile": "In another region of Chile",
  "En el extranjero": "Outside Chile",
  "Edad": "Age",
  "16 a 24": "16–24",
  "25 a 34": "25–34",
  "35 a 44": "35–44",
  "45 a 54": "45–54",
  "55 a 64": "55–64",
  "65 o más": "65 or older",
  "Sexo": "Sex",
  "Masculino": "Male",
  "Femenino": "Female",
  "Prefiero no decirlo": "Prefer not to say",
  "¿Qué destino visitó o visitará en la Región de Los Lagos?":
    "Which destination in the Los Lagos Region did you visit, or will you visit?",
  "¿Qué lugar recomendaría como imperdible?": "Which place would you recommend as a must-see?",
};

// Textos propios de "Encuesta AGA - Pasajeros" (propuesta 2026-11-10).
const PASAJEROS = {
  // nombres de aerolíneas: se mantienen
  "LATAM Airlines": "LATAM Airlines",
  "SKY Airline": "SKY Airline",
  "JetSMART": "JetSMART",
  "Boliviana de Aviación": "Boliviana de Aviación",
  "Aerovías DAP": "Aerovías DAP",
  "¿Qué tan probable es que destaques positivamente este aeropuerto entre amigos o familiares? (0 = nada probable, 10 = muy probable)":
    "How likely are you to speak positively about this airport to friends or family? (0 = not at all likely, 10 = extremely likely)",
  "Satisfacción con tiempo de espera en el control de seguridad": "Satisfaction with the waiting time at security screening",
  "Variedad y disponibilidad de restaurantes y tiendas": "Range and availability of restaurants and shops",
  "Información de vuelos (pantallas y anuncios por altavoz)":
    "Flight information (screens and public address announcements)",
  "¿Realizó check-in en el aeropuerto (tanto en mesón como en kiosko)?":
    "Did you check in at the airport (at the counter or at a kiosk)?",
  "¿Qué tipo de check-in utilizó?": "What type of check-in did you use?",
  "Solo kiosco de autoatención": "Self-service kiosk only",
  "Kiosco de autoatención + entrega de equipaje en mesón": "Self-service kiosk + bag drop at the counter",
  "Solo entrega de equipaje en mesón": "Bag drop at the counter only",
  "Satisfacción con tiempo de espera para el check-in": "Satisfaction with the waiting time at check-in",
  "¿Qué tipo de movilización utilizó para llegar al aeropuerto?": "How did you get to the airport?",
  "Vehículo particular": "Private car",
  "Transporte público/bus interurbano": "Public transport / intercity bus",
  "Taxi": "Taxi",
  "Vehículo de aplicación (uber, cabify, etc)": "Ride-hailing app (Uber, Cabify, etc.)",
  "Otro": "Other",
  "¿Requiere facilidades de movilidad reducida o posee algún tipo de discapacidad?":
    "Do you require assistance for reduced mobility, or do you have a disability?",
  "Satisfacción con la atención por parte del personal del aeropuerto frente a su discapacidad":
    "Satisfaction with the assistance airport staff provided for your disability",
  "¿Qué destino visitó o visitará en la región del aeropuerto?":
    "Which destination in the airport's region did you visit, or will you visit?",
  "¿Qué lugar recomendaría como imperdible en la región del aeropuerto?":
    "Which place in the airport's region would you recommend as a must-see?",
};

const dictionary = { ...APPROVED, ...PASAJEROS };
for (const [es, en] of Object.entries(SECTIONS)) {
  dictionary[es] = en;
  dictionary[`${es} — evaluación`] = `${en} — rating`;
}

const snippet = `/* === Cargar el INGLÉS (botón ES | EN) en la versión ACTIVA de "${TITLE}" ===
   Pegar en DevTools > Console estando en la página del cuestionario
   (/admin/cuestionarios/<id>), logueado como ADMIN. No crea una versión nueva:
   activa el botón, guarda el título en inglés y traduce la versión ACTIVA.
   Lo que se guarda en las respuestas no cambia (sigue en español).
   Si Chrome pide, escribe: allow pasting  y reintenta. */
(async () => {
  const id = location.pathname.split("/").filter(Boolean).pop();
  if (!location.pathname.includes("/admin/cuestionarios/") || !id) { console.error("✗ Abre primero la página del cuestionario ${TITLE}."); return; }
  if (!document.body.innerText.includes(${JSON.stringify(TITLE)})) { console.error("✗ Esta página no es la de «${TITLE}». No se cambió nada."); return; }
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
  const a = await fetch("/api/questionnaires/"+id, { method:"PATCH", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ bilingual: true, titleEn: ${JSON.stringify(TITLE_EN)} }) });
  if (!a.ok) { console.error("✗ Error activando el botón ES | EN:", a.status, await j(a)); return; }
  const t = await fetch("/api/questionnaires/"+id+"/translations", { method:"PATCH", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ target: "active", strict: false, dictionary: ${JSON.stringify(dictionary)} }) });
  const res = await j(t);
  if (!t.ok) { console.error("✗ Error guardando la traducción:", t.status, res); return; }
  console.log("%c✓ Inglés cargado en la v"+res.versionNumber+" ("+res.status+"): "+res.questions+" preguntas, "+res.sections+" secciones", "color:green;font-weight:bold");
  if (res.untranslated?.length) console.warn("Quedan en español (" + res.untranslated.length + "):", res.untranslated);
  else console.log("Todo traducido ✓");
})();
`;

const out = path.join(OUT_DIR, "aga-pasajeros-traducir-en-produccion.js");
writeFileSync(out, snippet, "utf8");
console.log(`Diccionario: ${Object.keys(dictionary).length} textos`);
console.log(`Snippet: ${out}`);
