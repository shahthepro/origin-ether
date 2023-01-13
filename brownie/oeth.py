import brownie
from brownie.network import accounts
import json

WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
OETHProxy = "0x10b342e0205Fc20a0934D1A0F25e270520439989"
VaultProxy = "0x9745A051bD218D78Eb6B5D0F53C685f6B052D478"
Governor = "0x98a0CbeF61bD2D21435f433bE4CD42B56B38CC93"
UserWallet = "0x1111122222333334444411111222223333344444"
MorphoAaveProxy = "0xf1b2b8C435e6641F6080D88a3D96Fd4609556Cd1"

def unlock(address):
    brownie.network.web3.provider.make_request('hardhat_impersonateAccount', [address])
    return accounts.at(address, force=True)

def fund_wallet(address):
    brownie.network.web3.provider.make_request('hardhat_setBalance', [address, "0xfff1bc16d674ec80000"])

def load_contract(name, address):
    with open("abi/oeth/%s.json" % name, 'r') as f:
        contract = json.load(f)
        return brownie.Contract.from_abi(name, address, contract.get("abi"))

governor = unlock(Governor)
user = unlock(UserWallet)

from_user = {'from': UserWallet}

weth = load_contract("WETH", WETH)
vault = load_contract("Vault", VaultProxy)
vault_admin = load_contract("VaultAdmin", VaultProxy)
vault_core = load_contract("VaultCore", VaultProxy)
oeth = load_contract("OETH", OETHProxy)
morpho_aave = load_contract("MorphoAaveStrategy", MorphoAaveProxy)

fund_wallet(Governor)
fund_wallet(UserWallet)

eth1 = 10**18
eth2 = eth1 * 2
eth5 = eth1 * 5

# def commas(v, decimals = 18):
#     v = int(int(v) / 10**decimals)
#     s = f'{v:,}'
#     return leading_whitespace(s, 16)

def wethToETH(amount = 1):
    weth.deposit({ "amount": eth1 * amount, "from": user.address})
    showBalance()

def showBalance():
    print("ETH: ", user.balance)
    print("WETH:", weth.balanceOf(user.address))
    print("OETH:", oeth.balanceOf(user.address))

def mintWithETH(amount = 1):
    vault_core.mint({"amount": eth1 * amount,"from":user.address})

def mintWithWETH(amount = 1):
    vault_core.mint(eth1 * amount,{"from":user.address})
