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
    const steps = [...form.querySelectorAll("[data-lead-step]")];
    const progress = form.querySelector("[data-lead-progress]");
    const submitLabel = form.querySelector("[data-lead-submit]");
    const error = form.querySelector("[data-lead-error]");
    const verified = { mobile: "", email: "" };
    let step = 1;

    function stepFields() {
      return [...steps[step - 1].querySelectorAll("[required]")];
    }

    function markInvalid() {
      let invalid = false;
      stepFields().forEach(function (field) {
        const bad = !field.checkValidity();
        field.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad) invalid = true;
      });
      if (error) {
        error.textContent = "Please complete the required fields.";
        error.hidden = !invalid;
      }
      return invalid;
    }

    function showStep(next) {
      step = next;
      steps.forEach(function (panel) {
        panel.hidden = Number(panel.dataset.leadStep) !== step;
      });
      progress.textContent = step === 1 ? "Step 1 of 2 · Your details" : "Step 2 of 2 · Your business";
      submitLabel.textContent = step === 1 ? "Continue" : "Submit";
      if (error) error.hidden = true;
      const first = steps[step - 1].querySelector("input, select, textarea");
      if (first) first.focus();
    }

    form.querySelectorAll("[required]").forEach(function (field) {
      field.addEventListener(field.tagName === "SELECT" ? "change" : "input", function () {
        if (field.getAttribute("aria-invalid") === "true") markInvalid();
      });
    });

    form.querySelector("[data-lead-back]").addEventListener("click", function () {
      showStep(1);
    });

    // OTP verification. No SMS or email provider is connected yet, so every
    // code is the fixed demo code.
    const dialog = document.getElementById("otp-dialog");
    const otpForm = dialog.querySelector("form");
    const boxes = [...dialog.querySelectorAll(".otp-boxes input")];
    const boxGroup = dialog.querySelector(".otp-boxes");
    const otpError = dialog.querySelector("[data-otp-error]");
    const resend = dialog.querySelector("[data-otp-resend]");
    const RESEND_SECONDS = 30;
    const DEMO_CODE = "000000";
    let queue = [];
    let total = 0;
    let channel = "";
    let code = "";
    let timer = 0;

    function formatTarget(kind) {
      if (kind === "mobile") {
        const m = form.mobile.value.trim();
        return "+91 " + m.slice(0, 5) + " " + m.slice(5);
      }
      return form.email.value.trim();
    }

    function newCode() {
      code = DEMO_CODE;
    }

    function clearBoxes() {
      boxes.forEach(function (box) { box.value = ""; });
      boxGroup.removeAttribute("data-bad");
      otpError.hidden = true;
    }

    function startCountdown() {
      clearInterval(timer);
      let left = RESEND_SECONDS;
      function render() {
        if (left > 0) {
          resend.innerHTML = "You'll be able to request another code in <strong>0:" + String(left).padStart(2, "0") + "</strong>";
        } else {
          clearInterval(timer);
          resend.innerHTML = "Didn't get it? <button type=\"button\" data-otp-again>Resend code</button>";
        }
      }
      render();
      timer = setInterval(function () { left -= 1; render(); }, 1000);
    }

    function openChannel(kind) {
      channel = kind;
      const position = total - queue.length;
      const label = kind === "mobile" ? "Verify mobile number" : "Verify email address";
      dialog.querySelector("[data-otp-kicker]").textContent =
        total > 1 ? label + " · " + position + " of " + total : label;
      dialog.querySelector("[data-otp-target]").textContent = formatTarget(kind);
      clearBoxes();
      newCode();
      startCountdown();
      if (!dialog.open) dialog.showModal();
      boxes[0].focus();
    }

    function startVerification() {
      // Only re-verify a contact that changed since it was last verified.
      queue = ["mobile", "email"].filter(function (kind) {
        return verified[kind] !== form[kind].value.trim();
      });
      total = queue.length;
      if (!total) {
        showStep(2);
        return;
      }
      openChannel(queue.shift());
    }

    function closeDialog() {
      clearInterval(timer);
      if (dialog.open) dialog.close();
    }

    // Spread several digits (SMS autofill, fast typing) across the boxes.
    function fillFrom(index, digits) {
      let last = index;
      digits.split("").forEach(function (digit, offset) {
        const target = boxes[index + offset];
        if (!target) return;
        target.value = digit;
        last = index + offset;
      });
      (boxes[last + 1] || boxes[last]).focus();
    }

    boxes.forEach(function (box, index) {
      box.addEventListener("input", function () {
        const digits = box.value.replace(/\D/g, "");
        boxGroup.removeAttribute("data-bad");
        otpError.hidden = true;
        if (digits.length > 1) {
          fillFrom(index, digits);
          return;
        }
        box.value = digits;
        if (box.value && boxes[index + 1]) boxes[index + 1].focus();
      });
      box.addEventListener("keydown", function (event) {
        if (event.key === "Backspace" && !box.value && boxes[index - 1]) {
          boxes[index - 1].focus();
        } else if (event.key === "ArrowLeft" && boxes[index - 1]) {
          event.preventDefault();
          boxes[index - 1].focus();
        } else if (event.key === "ArrowRight" && boxes[index + 1]) {
          event.preventDefault();
          boxes[index + 1].focus();
        }
      });
      box.addEventListener("paste", function (event) {
        const digits = (event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, boxes.length);
        if (!digits) return;
        event.preventDefault();
        fillFrom(digits.length === boxes.length ? 0 : index, digits);
      });
    });

    otpForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const entered = boxes.map(function (box) { return box.value; }).join("");
      if (entered !== code) {
        otpError.textContent = entered.length < boxes.length
          ? "Enter the 6 digit code."
          : "That code is not correct. Please try again.";
        otpError.hidden = false;
        boxGroup.setAttribute("data-bad", "");
        const empty = boxes.find(function (box) { return !box.value; });
        (empty || boxes[0]).focus();
        return;
      }
      verified[channel] = form[channel].value.trim();
      if (queue.length) {
        openChannel(queue.shift());
      } else {
        closeDialog();
        showStep(2);
      }
    });

    resend.addEventListener("click", function (event) {
      if (!event.target.closest("[data-otp-again]")) return;
      clearBoxes();
      newCode();
      startCountdown();
      boxes[0].focus();
    });

    dialog.querySelector("[data-otp-close]").addEventListener("click", closeDialog);
    dialog.addEventListener("close", function () { clearInterval(timer); });

    dialog.querySelector("[data-otp-edit]").addEventListener("click", function () {
      const field = form[channel];
      closeDialog();
      field.focus();
      field.select();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (markInvalid()) {
        const first = stepFields().find(function (field) { return !field.checkValidity(); });
        if (first) first.focus();
        return;
      }

      if (step === 1) {
        startVerification();
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.value.trim(),
          lastName: form.lastName.value.trim(),
          mobile: form.mobile.value.trim(),
          email: form.email.value.trim(),
          company: form.company.value.trim(),
          businessType: form.businessType.value,
          arn: form.arn.value.trim(),
          aum: form.aum.value.trim(),
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
