(function () {
  const claims = document.querySelector(".pgx-claims");
  if (claims) {
    const originals = [...claims.children].map(function (item) {
      return item.cloneNode(true);
    });
    const tickerQuery = window.matchMedia("(max-width: 1023px)");

    function renderClaims() {
      claims.replaceChildren();
      const copies = tickerQuery.matches ? 2 : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        originals.forEach(function (item) {
          claims.appendChild(item.cloneNode(true));
        });
      }
      if (tickerQuery.matches) claims.setAttribute("data-ticker", "");
      else claims.removeAttribute("data-ticker");
    }

    renderClaims();
    tickerQuery.addEventListener("change", renderClaims);
  }

  document.querySelectorAll(".acc").forEach(function (group) {
    group.querySelectorAll(".acc-q").forEach(function (button) {
      button.addEventListener("click", function () {
        const open = button.getAttribute("aria-expanded") === "true";
        group.querySelectorAll(".acc-q").forEach(function (other) {
          other.setAttribute("aria-expanded", "false");
          const panel = document.getElementById(other.getAttribute("aria-controls"));
          if (panel) panel.removeAttribute("data-open");
        });
        if (!open) {
          button.setAttribute("aria-expanded", "true");
          const panel = document.getElementById(button.getAttribute("aria-controls"));
          if (panel) panel.setAttribute("data-open", "");
        }
      });
    });
  });

  const qualify = document.querySelector("[data-qualify]");
  if (qualify) {
    const boxes = [...qualify.querySelectorAll('input[type="checkbox"]')];
    const status = qualify.querySelector("[data-ql-status]");
    const words = ["zero", "one", "two", "three", "four", "five"];

    function updateQualify() {
      const count = boxes.filter(function (box) { return box.checked; }).length;
      if (status) status.textContent = count + " of " + boxes.length + " confirmed";
      if (words[count]) qualify.dataset.all = words[count];
    }

    boxes.forEach(function (box) {
      box.addEventListener("change", updateQualify);
    });
  }

  const footerQuery = window.matchMedia("(max-width: 1023px)");

  function renderFooter() {
    document.querySelectorAll(".fls-cols > div").forEach(function (column) {
      const heading = column.querySelector(".fls-h");
      const list = column.querySelector("ul");
      if (!heading || !list) return;

      if (footerQuery.matches) {
        column.setAttribute("data-fold", "");
        if (!heading.querySelector(".fls-fold")) {
          const label = heading.textContent.trim();
          heading.textContent = "";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "fls-fold acc-q";
          button.setAttribute("aria-expanded", "false");
          const name = document.createElement("span");
          name.textContent = label;
          const sign = document.createElement("span");
          sign.className = "acc-sign";
          sign.setAttribute("aria-hidden", "true");
          button.append(name, sign);
          button.addEventListener("click", function () {
            const expanded = button.getAttribute("aria-expanded") === "true";
            button.setAttribute("aria-expanded", expanded ? "false" : "true");
            list.hidden = expanded;
          });
          heading.appendChild(button);
        }
        const button = heading.querySelector(".fls-fold");
        list.hidden = button.getAttribute("aria-expanded") !== "true";
      } else {
        column.removeAttribute("data-fold");
        const button = heading.querySelector(".fls-fold");
        if (button) heading.textContent = button.querySelector("span").textContent;
        list.hidden = false;
      }
    });
  }

  renderFooter();
  footerQuery.addEventListener("change", renderFooter);

  const form = document.getElementById("lead-form");
  if (form) {
    const required = [...form.querySelectorAll("[required]")];

    function markInvalid() {
      let invalid = false;
      required.forEach(function (field) {
        const bad = !field.checkValidity();
        field.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad) invalid = true;
      });
      const error = form.querySelector("[data-lead-error]");
      if (error) {
        error.textContent = "Please complete the required fields.";
        error.hidden = !invalid;
      }
      return invalid;
    }

    required.forEach(function (field) {
      field.addEventListener("input", function () {
        if (field.getAttribute("aria-invalid") === "true") markInvalid();
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (markInvalid()) {
        const first = required.find(function (field) { return !field.checkValidity(); });
        if (first) first.focus();
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector("[data-lead-error]");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.value.trim(),
          lastName: form.lastName.value.trim(),
          email: form.email.value.trim(),
          company: form.company.value.trim(),
          comments: form.comments.value.trim()
        })
      }).then(function (response) {
        if (!response.ok) throw new Error("Could not save the lead.");
        form.querySelector("[data-lead-card]").hidden = true;
        form.querySelector(".elig-agree").hidden = true;
        form.querySelector(".lead-thanks").hidden = false;
      }).catch(function () {
        if (error) {
          error.textContent = "We could not save your details. Please try again.";
          error.hidden = false;
        }
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    });
  }
})();
