// ==UserScript==
// @name         PlaceID Bot
// @namespace    https://github.com/placeID/bot
// @version      3
// @description  Bot /r/place untuk r/indonesia
// @author       NoahvdAa, reckter, SgtChrome, nama17, pejuangkorpus
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/placeID/bot/raw/main/placeidbot.user.js
// @downloadURL  https://github.com/placeID/bot/raw/main/placeidbot.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

// Kodenya belum rapi sama sekali ;)

var placeOrders = [];
var accessToken;
var canvas = document.createElement('canvas');

const VERSI = 3;
var BELUM_DIPERBARUI = false;

const PETA_WARNA = {
	'#BE0039': 1,	// dark red
	'#FF4500': 2,	// red
	'#FFA800': 3,	// orange
	'#FFD635': 4,	// yellow
	'#00A368': 6,	// dark green
	'#00CC78': 7,	// green
	'#7EED56': 8,	// light green
	'#00756F': 9,	// dark teal
	'#009EAA': 10,	// teal
	'#2450A4': 12,	// dark blue
	'#3690EA': 13,	// blue
	'#51E9F4': 14,	// light blue
	'#493AC1': 15,	// indigo
	'#6A5CFF': 16,	// periwinkle
	'#811E9F': 18,	// dark purple
	'#B44AC0': 19,	// purple
	'#FF3881': 22,	// pink
	'#FF99AA': 23,	// light pink
	'#6D482F': 24,	// dark brown
	'#9C6926': 25,	// brown
	'#000000': 27,	// black
	'#898D90': 29,	// gray
	'#D4D7D9': 30,	// light gray
	'#FFFFFF': 31	// white
};

(async function () {
	GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
	canvas.width = 2000;
	canvas.height = 1000;
	canvas = document.body.appendChild(canvas);

	Toastify({
		text: 'Mengambil token akses...',
		duration: 10000 // 10 detik
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Token akses didapatkan!',
		duration: 30000 // 30 detik
	}).showToast();

	setInterval(updateOrders, 5 * 60 * 1000); // Perbarui perintah tiap lima menit.
	await updateOrders();
	attemptPlace();
})();

function shuffleWeighted(array) {
	for (const item of array) {
		item.rndPriority = Math.round(placeOrders.priorities[item.priority] * Math.random());
	}
	array.sort((a, b) => b.rndPriority - a.rndPriority);
}

function getPixelList() {
	const structures = [];
	for (const structureName in placeOrders.structures) {
		shuffleWeighted(placeOrders.structures[structureName].pixels);
		structures.push(placeOrders.structures[structureName]);
	}
	shuffleWeighted(structures);
	return structures.map(structure => structure.pixels).flat();
}

async function attemptPlace() {
	var ctx;
	try {
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('0'), canvas, 0, 0);
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('1'), canvas, 1000, 0);
	} catch (e) {
		console.warn('Galat ketika mengambil papan:', e);
		Toastify({
			text: 'Galat ketika mengambil papan. Ulangi dalam 15 detik...',
			duration: 15000 // 15 detik
		}).showToast();
		setTimeout(attemptPlace, 15000); // Coba lagi dalam 15 detik.
		return;
	}

	const pixelList = getPixelList();

	for (const order of pixelList) {
		const x = order.x;
		const y = order.y;
		const colorId = PETA_WARNA[order.color] ?? order.color;

		const rgbaAtLocation = ctx.getImageData(x, y, 1, 1).data;
		const hex = rgbToHex(rgbaAtLocation[0], rgbaAtLocation[1], rgbaAtLocation[2]);
		const currentColorId = PETA_WARNA[hex];
		// Pixel sudah diatur
		if (currentColorId == colorId) continue;

		Toastify({
			text: `Mengatur piksel di (${x}, ${y})...`,
			duration: 300000 // 5 menit
		}).showToast();
		console.log(`Mengatur piksel di (${x}, ${y})...`);

		const time = new Date().getTime();
		let nextAvailablePixelTimestamp = await place(x, y, colorId) ?? new Date(time + 1000 * 60 * 5 + 1000 * 15)

		// Periksa nilai timestamp
		if (nextAvailablePixelTimestamp < time || nextAvailablePixelTimestamp > time + 1000 * 60 * 5 + 1000 * 15) {
			nextAvailablePixelTimestamp = time + 1000 * 60 * 5 + 1000 * 15;
		}

		// Tambah beberapa detik secara acak ke timestamp piksel selanjutnya
		const waitFor = nextAvailablePixelTimestamp - time + (Math.random() * 1000 * 15);

		const minutes = padLeft2(Math.floor(waitFor / (1000 * 60)))
		const seconds = padLeft2(Math.floor((waitFor / 1000) % 60))
		Toastify({
			text: `Menunggu waktu jeda ${minutes}.${seconds} menit sampai ${new Date(time + waitFor).toLocaleTimeString()}`,
			duration: waitFor
		}).showToast();
		setTimeout(attemptPlace, waitFor);
		return;
	}
	
	setTimeout(attemptPlace, 30000); // Coba lagi dalam 30 detik.
}

function updateOrders() {
	fetch(`https://placeid.github.io/piksel/piksel.json`, {cache: "no-store"}).then(async (response) => {
		if (!response.ok) return console.warn('Tidak bisa memuat perintah!');
		const data = await response.json();

		if (JSON.stringify(data) !== JSON.stringify(placeOrders)) {
			const structureCount = Object.keys(data.structures).length;
			let pixelCount = 0;
			for (const structureName in data.structures) {
				pixelCount += data.structures[structureName].pixels.length;
			}
			Toastify({
				text: `Perintah baru dimuat: ${structureCount} struktur (${pixelCount} piksel).`,
				duration: 30000 // 30 detik
			}).showToast();
		}

		if (data?.VERSI !== VERSI && !BELUM_DIPERBARUI) {
			BELUM_DIPERBARUI = true
			Toastify({
				text: `VERSI BARU TERSEDIA! Perbarui di sini: https://github.com/placeID/bot/raw/main/placeidbot.user.js (atau klik pesan ini)`,
				duration: -1,
				onClick: () => {
					// Tapermonkey menangkapnya dan membuka di tab baru
					window.location = 'https://github.com/placeID/bot/raw/main/placeidbot.user.js'
				}
			}).showToast();

		}
		placeOrders = data;
	}).catch((e) => console.warn('Tidak bisa memuat perintah!', e));
}

/**
 * Places a pixel on the canvas, returns the "nextAvailablePixelTimestamp", if succesfull
 * @param x
 * @param y
 * @param color
 * @returns {Promise<number>}
 */
async function place(x, y, color) {
	const response = await fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x % 1000,
							'y': y % 1000
						},
						'colorIndex': color,
						'canvasIndex': (x > 999 ? 1 : 0)
					}
				}
			},
			'query': `mutation setPixel($input: ActInput!) {
				act(input: $input) {
					data {
						... on BasicMessage {
							id
							data {
								... on GetUserCooldownResponseMessageData {
									nextAvailablePixelTimestamp
									__typename
								}
								... on SetPixelResponseMessageData {
									timestamp
									__typename
								}
								__typename
							}
							__typename
						}
						__typename
					}
					__typename
				}
			}
			`
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
	const data = await response.json()
	if (data.errors != undefined) {
		console.warn('Galat saat mengatur piksel. Menunggu waktu jeda...');
		Toastify({
			text: 'Galat saat mengatur piksel. Menunggu waktu jeda...',
			duration: 300000 // 5 menit
		}).showToast();
		return data.errors[0].extensions?.nextAvailablePixelTs
	}
	console.log('Piksel berhasil diatur');
	Toastify({
		text: 'Piksel berhasil diatur',
		duration: 300000 // 5 menit
	}).showToast();
	return data?.data?.act?.data?.[0]?.data?.nextAvailablePixelTimestamp
}

async function getAccessToken() {
	const usingOldReddit = window.location.href.includes('new.reddit.com');
	const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
	const response = await fetch(url);
	const responseText = await response.text();

	// TODO: cari cara yang lebih baik
	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

async function getCurrentImageUrl(id = '0') {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));
			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': id
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': `subscription replace($input: SubscribeInput!) {
						subscribe(input: $input) {
							id
							... on BasicMessage {
								data {
									__typename
									... on FullFrameMessageData {
										__typename
										name
										timestamp
									}
								}
								__typename
							}
							__typename
						}
					}
					`
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			// TODO: cari cara yang lebih baik
			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name + `?noCache=${Date.now() * Math.random()}`);
		}


		ws.onerror = reject;
	});
}

function getCanvasFromUrl(url, canvas, x = 0, y = 0) {
	return new Promise((resolve, reject) => {
		var ctx = canvas.getContext('2d');
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			ctx.drawImage(img, x, y);
			resolve(ctx);
		};
		img.onerror = reject;
		img.src = url;
	});
}

function padLeft2(a) {
	a = a.toString()
	return a.length == 1 ? "0" + a : a;
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
