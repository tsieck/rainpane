const frame = document.querySelector('iframe')!;
document.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', () => {
    frame.width = button.dataset.width!;
    frame.height = button.dataset.height!;
  });
});
