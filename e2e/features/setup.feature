Feature: First-run Setup Wizard

  Scenario: First-run server redirects root to /setup and renders without CSP errors
    Given a Knife server running in first-run mode
    When the user visits "/"
    Then the browser should be on "/setup"
    And the setup page should be rendered
    And there should be no CSP or runtime page errors

  Scenario: Visiting /setup with a URL fragment token auto-fills the form and clears the hash
    Given a Knife server running in first-run mode
    When the user visits "/setup" with the one-time setup token in the URL fragment
    Then the HTTP response status should be 200
    And the setup token field should be pre-filled with the server setup token
    And the URL fragment should be cleared
    And there should be no CSP or runtime page errors

  Scenario: Completing the setup form transitions the server to /login
    Given a Knife server running in first-run mode
    When the user visits "/setup"
    And submits a valid setup configuration for "octocat"
    Then the browser should be on "/login"
    And the login page should be rendered
    And there should be no CSP or runtime page errors
