# LibEulerSwap

This is a Javascript library containing functions useful for creating and interacting with [EulerSwap](https://github.com/euler-xyz/euler-swap) instances.

You can copy the files in `src/` into your project, or submodule it in. You can import individual functions, or everything at once like so:

    import * as LibEulerSwap from "../lib/euler-swap-jslib/src/LibEulerSwap";

The only dependency is on `viem`.


## Pool Creation

### `genAddress(readClient, eulerSwapFactory, params)`

This function mines a salt that will return an Uniswap4 hook-compatible address. It returns both the resulting address and the salt.

`readClient` should be a viem `publicClient`, which is needed to read the implementation address from the factory.

`params` should be an object containing the EulerSwap construction parameters, for example:

    {
        "vault0": "0xF9Ec57D2436177B4Decf90Ef9EdffCef0cC0EE25",
        "vault1": "0x3b3112c4376d037822DECFf3Fe6CD30E1E726517",
        "eulerAccount": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "equilibriumReserve0": "99151798335",
        "equilibriumReserve1": "22627333318631539267",
        "priceX": "1000000000000000000",
        "priceY": "2864593227",
        "concentrationX": "950000000000000000",
        "concentrationY": "950000000000000000",
        "fee": "100000000000000",
        "protocolFee": "0",
        "protocolFeeRecipient": "0x0000000000000000000000000000000000000000"
    }

### `creationCode(readClient, eulerSwapFactory, params)`

This function is used internally by `genAddress` but is exposed in case it is useful in some other context.

## Pricing Helpers

### `getCurrentPrice(params, reserve0, reserve1)`

Given a curve point indicated by two reserve values, returns the marginal price on the curve at this point. The price is returned as a `10**18` scaled fraction.

### `getCurrentPriceRAY(params, reserve0, reserve1)`

Given a curve point indicated by two reserve values, returns the marginal price on the curve at this point. The price is returned as a `10**27` scaled fraction.

### `getCurrentReserves(params, currentPrice)`

Given a marginal price for a point on the curve, returns the two reserves of that point. The price input is a `10**18` scaled fraction.

### `getCurrentReservesRAY(params, currentPriceRAY)`

Given a marginal price for a point on the curve, returns the two reserves of that point. The price input is a `10**27` scaled fraction.

### `verifyPoint(params, reserve0, reserve1)`

Returns true if the point is on or above the curve specified by `params`. If true, it means that the EulerSwap contract would accept this point as a valid point after a swap.

### `verifyOnCurveExact(params, reserve0, reserve1)`

Returns true if the point is exactly on the curve specified by `params`. This means that the point both satisifies `verifyPoint()`, and you could not subtract even `1` from either reserve value without causing `verifyPoint()` to fail.

When creating an EulerSwap instance, the initial current reserves must satisfy this function.

### `tightenToCurve(params, reserve0, reserve1)`

This function takes a point that is on or above the curve, and reduces the reserves until they are exactly on the curve.

In other words, it takes a point that satisfies `verifyPoint()` and moves the point down and to the left until it also satisifies `verifyOnCurveExact()`.

### `computePriceFraction(price, decimals0, decimals1)`

Given a price expressed as a JS Number, it returns a numerator and denominator representing a corresponding fraction that can be supplied as the curve's `priceX` and `priceY` parameters.

It also scales the numbers to account for the two vault's decimals.



## Curve Math

These are the low-level math functions used by the pricing helper functions, and may useful for other purposes. In general they follow the conventions from `CurveLib.sol` in the contracts.

### `f(x, px, py, x0, y0, c)`

The fundamental "EulerSwap Curve" equation. Returns `y` given `x` and curve parameters.

### `verify(x, y, px, py, x0, y0, cx, cy)`

Verifies that point `(x, y)` is on or above the curve.

### `df_dx(x, px, py, x0, cx)`

The derivative of `f()`. Useful for computing the marginal price at given curve points.

### `df_dx_RAY(x, px, py, x0, cx)`

The derivative of `f()`. Useful for computing the marginal price at given curve points. The output is a `10**27` scaled fraction.

### `fInverse(y, px, py, x0, y0, cx)`

The inverse function of `f`. Useful for determining how much to swap while staying below/above a target marginal price.




## License

(C) 2025 Euler Labs

MIT license
