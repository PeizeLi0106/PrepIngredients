// Preload the audio without playing it initially
const notificationAudio = new Audio('/audio/notification.mp3'); // Update the path if needed

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
    if (message === "prepping a veg"){
        notificationAudio.play(); // play the sound only when the message is "prepping a meat"
    } // don't play sound when an ingredient is received

    const container = document.querySelector(".row");
    container.innerHTML = ""; // Clear existing cards

    renderList.forEach(({ name, urgent, timestamp }) => {
        const [mandarin, german] = name.split(" ");
        const card = document.createElement("div");
        card.className = "col";
        card.innerHTML = `
        <div id="${mandarin}" class="card h-100" style="${urgent ? 'background-color: #ffc107' : ''}">
            <div id="cover">
                <img src="https://dcf196gsozjg8.cloudfront.net/${mandarin}${timestamp ? "-" + timestamp : ""}.jpg" class="card-img-top" alt="${german}">
            </div>
            <div class="card-body">
                <h6 class="card-title" style="font-style: italic;">${mandarin}</h6>
                <h6 class="card-title" style="font-style: italic;">${german}</h6>
            </div>
        </div>
        `;
        container.appendChild(card); // or prepend if you want newest first
    });
});

socket.on("help", ()=> {
    const alertBox = document.getElementById("help-alert");
    alertBox.classList.remove("d-none");
    notificationAudio.play(); // Play the notification sound
    // Optional: auto-hide after 6 seconds
    setTimeout(() => {
        alertBox.classList.add("d-none");
    }, 6000);
});

socket.on("connect_error", (error) => {
    console.error("Socket.IO connection error:", error);
});

// Optional: Clean up when the page is being unloaded
window.addEventListener("beforeunload", () => {
    socket.disconnect(); // Explicitly disconnect the Socket.IO connection
});