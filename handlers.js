/**
 * BUTTON CLICK HANDLERS
 *
 * Each button on the homepage has its own handler function below.
 * Replace the placeholder console.log with your own implementation.
 */

function onButton1Click() {
  window.location.href = "baran.html";
}

function onButton2Click() {
  console.log("Button 2 clicked -- implement me!");
}

function onButton3Click() {
  window.location.href = "ekin.html";
}

function onButton4Click() {
  console.log("Button 4 clicked -- implement me!");
}

function onButton5Click() {
  var area = document.getElementById("result-area");
  area.style.display = "block";
  area.innerHTML =
    '<p class="info-text">This page fetches data from the ' +
    "<strong>DummyJSON API</strong> (<code>dummyjson.com</code>). " +
    "DummyJSON is a free fake REST API for testing and prototyping. " +
    "The data below shows sample blog posts &mdash; each post has an ID, title, and body. " +
    "These are not real posts; they are placeholder data provided by the API for development purposes.</p>" +
    '<p class="loading">Loading posts...</p>';

  fetch("https://dummyjson.com/posts?limit=5")
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      var posts = data.posts;
      var html =
        '<p class="info-text">This page fetches data from the ' +
        "<strong>JSONPlaceholder API</strong> (<code>jsonplaceholder.typicode.com</code>). " +
        "JSONPlaceholder is a free fake REST API for testing and prototyping. " +
        "The data below shows sample blog posts &mdash; each post has an ID, title, and body. " +
        "These are not real posts; they are placeholder data provided by the API for development purposes.</p>";

      posts.forEach(function (post) {
        html +=
          '<div class="post-card">' +
          '<div class="post-id">Post #' + post.id + "</div>" +
          "<h3>" + post.title + "</h3>" +
          "<p>" + post.body + "</p>" +
          "</div>";
      });
      area.innerHTML = html;
    })
    .catch(function (err) {
      area.innerHTML = '<p class="loading" style="color:#ef4444;">Failed to load posts: ' + err.message + "</p>";
    });
}

function onButton6Click() {
  window.location.href = "omerbelemir.html";
}

function onButton7Click() {
  window.location.href = "arif-evren.html";
}
