var fadeInSide = function (divElement) {
    setTimeout(function () {
        divElement.style.marginLeft = "0";
        divElement.style.backgroundColor = "rgba(74,74,74,0.95)";
    }, 500);
};

var fadeOutSide = function (divElement) {
    divElement.addEventListener("transitionend", event => {
        divElement.remove();
    }, false);
    divElement.style.marginLeft = "100%";
    divElement.style.opacity = "0";
};