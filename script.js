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
.document,addEventListener("scroll", handleScroll);

var scrollToTopBtn = document.querySelector(".scroll-up");

function handleScroll() {
    var scrollableHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var GOLDEN_RATIO = 0.5;

    if ((document.documentElement.scrollTop / scrollableHeight ) > GOLDEN_RATIO) {
        //show button
        scrollToTopBtn.style.display = "block";
    } else {
        //hide button
        scrollToTopBtn.style.display = "none";
    }
}

scrollToTopBtn.addEventListener("click", scrollToTop);

function scrollUp() {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

