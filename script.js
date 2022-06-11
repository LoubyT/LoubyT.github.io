//hamburger menu
const hamburger = document.querySelector(".hamburger");
const navigation = document.querySelector(".navigation");

hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navigation.classList.toggle("active");
})

document.querySelectorAll(".main-nav-link").forEach(n => n. addEventListener("click", () => {
    hamburger.classList.remove("active");
    navigation.classList.remove("active");
}))

//scroll to top functionality
const scrollUp = document.querySelector("#scroll-up");

scrollUp.addEventListener("click", () => {
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
    });
});