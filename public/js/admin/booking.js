function openDetail(shop, lock, date, name, phone) {
    document.getElementById("shop").innerText = shop;
    document.getElementById("lock").innerText = lock;
    document.getElementById("date").innerText = date;
    document.getElementById("name").innerText = name;
    document.getElementById("phone").innerText = phone;

    document.getElementById("popup").style.display = "flex";
}

function closePopup() {
    document.getElementById("popup").style.display = "none";
}
