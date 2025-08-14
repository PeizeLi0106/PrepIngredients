// Preload the audio without playing it initially
const notificationAudio = new Audio('/audio/notification.mp3'); // Update the path if needed
const helpAudio = new Audio('/audio/help.mp3'); // Update the path if needed


// Request notification permission
if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
            console.log('Notification permission granted');
        } else {
            console.log('Notification permission denied');
        }
    });
}

const socket = io(location.hostname === 'localhost' ? 'http://localhost:3000': `${window.location.protocol}//${window.location.host}`);    

socket.on("updates shortage", (data) => {
    const {renderList, message} = data;
    if (message === "prepping a meat"){
        notificationAudio.play(); // play the sound only when the message is "prepping a meat"
    } // don't play sound when an ingredient is received

    const container = document.querySelector(".row");
    container.innerHTML = ""; // Clear existing cards

    renderList.forEach(({ name, urgent, timestamp }) => {
        const [mandarin, german] = name.split(" ");
        const isRice = mandarin === "米饭";
        const quantity = isRice ? urgent : 1;
        let extraH6 = "";
        if (["毛豆", "花生", "冰粉", "仙草"].includes(mandarin)) {
            extraH6 = `<h6 class="card-title" style="font-style: italic;font-size: 1.5rem; color: red;">${urgent ? "外卖" : "堂食"}</h6>`;
        }
    
        for (let i = 0; i < quantity; i++) {
            const card = document.createElement("div");
            card.className = "col";
            card.innerHTML = `
                <div id="${mandarin}-${i}" class="card h-100" style="${!isRice && urgent ? 'background-color: #ffc107' : ''}">
                    <div id="cover">
                        <img src="https://dcf196gsozjg8.cloudfront.net/${mandarin}${timestamp ? "-" + timestamp : ""}.jpg" class="card-img-top" alt="${german}">
                    </div>
                    <div class="card-body">
                        <h6 class="card-title" style="font-style: italic;">${mandarin}</h6>
                        <h6 class="card-title" style="font-style: italic;">${german}</h6>
                        ${extraH6}
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    });
    
});

socket.on("help", () => {
    const alertBox = document.getElementById("help-alert");
    alertBox.classList.remove("d-none");   
    helpAudio.play(); // Play the help sound
    // Optional: auto-hide after 8 seconds
    setTimeout(() => {
        alertBox.classList.add("d-none");
    }, 8000);
});

socket.on("connect_error", (error) => {
    console.error("Socket.IO connection error:", error);
});

// Optional: Clean up when the page is being unloaded
window.addEventListener("beforeunload", () => {
    socket.disconnect(); // Explicitly disconnect the Socket.IO connection
});