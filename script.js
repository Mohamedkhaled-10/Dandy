  let current = 0;
  const images = document.querySelectorAll('.hero-slider img');
  const total = images.length;

  setInterval(() => {
    images[current].classList.remove('active');
    current = (current + 1) % total;
    images[current].classList.add('active');
  }, 4000); // كل 4 ثواني تتغير الصورة