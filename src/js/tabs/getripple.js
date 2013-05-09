var util = require('util'),
  Tab = require('../client/tab').Tab,
  Amount = ripple.Amount,
  giveawayTotal = 4;

var GetRippleTab = function() {
  Tab.call(this);
};

util.inherits(GetRippleTab, Tab);

GetRippleTab.prototype.mainMenu = 'getripple';

GetRippleTab.prototype.generateHtml = function() {
  return require('../../jade/tabs/getripple.jade')();
};

GetRippleTab.prototype.angularDeps = Tab.prototype.angularDeps.concat(['books']);
GetRippleTab.prototype.angular = function(module) {

  module.controller('GetRippleCtrl', ['rpBooks', '$scope', '$routeParams', '$rootScope', 'rpId',

  function(books, $scope, $routeParams, $rootScope, $id) {

    if (!$id.loginStatus) return $id.goId(); //Don't see this page until you log in.

    // check every 5 seconds when server is down
    var giveawayIntervalTime = 5000;
    var stateUpdated = false;
    $scope.register = false;
    $scope.address = false;
    $scope.offline = false;
    $scope.payout = 0;

    // receive payout event
    $scope.$on('payout', function() {
      var ask, bid, unrounded;
      $scope.$watch('book.asks', function(asks) {
        if (!(asks.length)) return;
        ask = asks[0].quality / 1000000;
        if (!ask) return;
        unrounded = $scope.payout / Math.sqrt(ask * bid);
        $scope.usd_equivalent = (Math.round(unrounded * 100) / 100).toFixed(2); //TODO: Round using filter, not in this code
        $scope.updated_time = currentTime();
      }, true);

      $scope.$watch('book.bids', function(bids) {
        if (!(bids.length)) return;
        bid = 0.000001 / bids[0].quality;
        if (!bid) return;
        unrounded = $scope.payout / Math.sqrt(ask * bid);
        $scope.usd_equivalent = (Math.round(unrounded * 100) / 100).toFixed(2);
        $scope.updated_time = currentTime();
      }, true);
    });

    // update payout variable
    $.get(Options.giveawayServer + '/user/payout', function(d) {
      $scope.payout = d.payout;
      $scope.$broadcast('payout');
    });

    // watch user blob for changes
    $rootScope.$watch('userBlob', function() {
      // if giveaway register is set
      if ($rootScope.userBlob.data.giveaway_register) {
        // setup variables
        $scope.address = $rootScope.userBlob.data.account_id;
        $scope.register = $rootScope.userBlob.data.giveaway_register;
        // if state hasn't been updated, only run on initilizaiton
        if (!stateUpdated) {
          // if user has been paid out
          if ($id.giveaway_register.hasOwnProperty('funded_amount')) {
            // update giveaway
            updateGiveawayState({
              funded: $id.giveaway_register.funded_amount,
              funded_address: $id.giveaway_register.funded_address,
              state: false,
              total: false
            });
          } else {
            // if user has not been paid out yet
            var total = 0;
            // show loading throbber
            $scope.loading = true;
            // fetch state determined by user id
            $.get(Options.giveawayServer + '/user/state/' + $scope.register.id, {
              register: $scope.register.hash
            }, function(user) {
              updateGiveawayState(user);
            });
          }

        }
      }
    });

    // monitor click state
    $scope.clickState = function(item) {
      // return false if already done
      if ($rootScope[item + 'Class'] == 'done') return false;

      $.post(Options.giveawayServer + '/user/' + $scope.register.id, {
        action: 'state',
        state: item,
        register: $scope.register.hash
      }, function(data) {
        $scope.updateState(item);
        // if state has been all clicked then show claim
        if (data.count == 4) {
          $scope.finish = true;
          $scope.$apply();
        }
      });
    };

    // update state locally
    $scope.updateState = function(item) {
      // return false if already done
      if ($rootScope[item + 'Class'] == 'done') return false;

      $rootScope[item + 'Class'] = 'done';
      $rootScope.$apply();
    };

    function loadOffers() {
      // Make sure we unsubscribe from any previously loaded orderbook
      if ($scope.book &&
        "function" === typeof $scope.book.unsubscribe) {
        $scope.book.unsubscribe();
      }
      $scope.book = books.get({
        currency: "USD",
        issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
      }, {
        currency: "XRP" //,
      }, $scope.address);
    }
    loadOffers();

    function currentTime() {
      var currentdate = new Date();
      var hour = currentdate.getHours();
      var meridian = (hour >= 12 ? "pm" : "am");
      if (hour === 0) {
        hour = 12;
      } else if (hour > 12) {
        hour -= 12;
      }
      var minutes = "" + (currentdate.getMinutes());
      if (minutes.length == 1) {
        minutes = "0" + minutes;
      }
      return hour + ":" + minutes + meridian;
    }

    // do funding
    $scope.congrats = function() {
      $scope.finish = false;
      $scope.claim = true;
      $.post(Options.giveawayServer + '/user/' + $scope.register.id, {
        action: 'fund',
        register: $scope.register.hash,
        address: $scope.address
      }, function(res) {
        // update payout variable just in case
        $scope.payout = res.funded;
        if ($scope.book &&
          "function" === typeof $scope.book.unsubscribe) {
          $scope.book.unsubscribe();
        }
        $scope.$apply();
      });
    };

    // create interval to keep checking status
    setInterval(function() {
      checkGiveawayServer();
    }, giveawayIntervalTime);
    checkGiveawayServer();

    // update feedback state
    function updateGiveawayState(user) {
      // if user has already been funded hide page
      if (user.funded) {
        $scope.claim = true;
        $scope.payout = user.funded;
        // check if current id equals funded address and that funded address exists
        if (($id.account != user.funded_address) && (user.funded_address)) $scope.different_address = true;
        // check if blob has the payout saved, if not save it
        if (!$id.giveaway_register.hasOwnProperty('funded_amount')) {
          var data = {};
          _.extend(data, $id.giveaway_register, {
            funded_amount: user.funded,
            funded_address: user.funded_address
          });
          // update blob
          $id.updateBlob('giveaway_register', data);
        }
      } else {
        var total = 0;
        $scope.earn = true;
        // iterate states
        _.each(user.state, function(v, i) {
          //  state is true then update class
          if (v) $scope.updateState(i);
          total += (v) ? 1 : 0;
        });

        // if total is giveaway total then show finish
        if (total == giveawayTotal) $scope.finish = true;
        // don't run again
        stateUpdated = true;
      }

      // don't interrupt digest already in progress
      if (!$scope.$$phase) $scope.$apply();
    }

    // handy function to check if server is down

    function checkGiveawayServer() {
      // check if server is up
      webutil.giveawayServerStatus(function(status) {
        $scope.offline = !status;
        $scope.$apply();
      });
    }

  }]);
};

GetRippleTab.prototype.handleRetrigger = function() {
  var $scope = $('#t-send').data('$scope');
  if ($scope && $scope.mode !== 'form') {
    $scope.reset();
    $scope.$digest();
  }
};

module.exports = GetRippleTab;