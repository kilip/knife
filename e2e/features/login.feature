Feature: Login Page

  Scenario: Configured server renders /login with HTTP 200 and no CSP errors
    Given a Knife server running in configured mode
    When the user visits "/login"
    Then the HTTP response status should be 200
    And the login page should be rendered
    And there should be no CSP or runtime page errors

  Scenario: Unauthenticated user visiting root is redirected to /login
    Given a Knife server running in configured mode
    When the user visits "/"
    Then the browser should be on "/login"
    And the login page should be rendered
    And there should be no CSP or runtime page errors
