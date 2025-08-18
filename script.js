// تفعيل الكلك على Dropdown في التابلت / اللمس
document.querySelectorAll("nav ul li.dropdown > a").forEach(dropLink => {
  dropLink.addEventListener("click", function (e) {
    // منع الانتقال الفوري للرابط #
    e.preventDefault();

    const parent = this.parentElement;

    // قفل أي Dropdown مفتوح غير الحالي
    document.querySelectorAll("nav ul li.dropdown").forEach(item => {
      if (item !== parent) {
        item.classList.remove("active");
      }
    });

    // تبديل الكلاس Active
    parent.classList.toggle("active");
  });
});

// إغلاق القائمة عند الضغط خارجها
document.addEventListener("click", function (e) {
  if (!e.target.closest("nav ul li.dropdown")) {
    document.querySelectorAll("nav ul li.dropdown").forEach(item => {
      item.classList.remove("active");
    });
  }
});
