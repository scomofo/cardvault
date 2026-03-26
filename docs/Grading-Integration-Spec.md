# **Specification: Grading & Quick-Logging Module Integration**

## **Project: CardVault**

**Objective:** Integrate a "Quick-Scan" grading workflow, automated condition assessment, and eBay-ready metadata generation into the existing card scanning architecture.

## **1\. Data Schema Updates**

The Card model must be extended to include sub-grade attributes and a calculated status.

### **New Database Fields**

* centering: Integer (1-10)  
* corners: Integer (1-10)  
* edges: Integer (1-10)  
* surface: Integer (1-10)  
* projected\_grade: Float (Calculated)  
* vault\_status: String (Enum: GREEN, YELLOW, RED)  
* condition\_report: Text/String (Automated description)

## **2\. Logic & Core Functions**

### **A. The "Weighted Floor" Algorithm**

The final grade is the average of sub-grades, but it cannot exceed the lowest sub-grade by more than **1.0 point**.

### **B. Traffic Light Sorting (Pile Logic)**

* **GREEN (Grading Candidate):** Grade ![][image1]  
* **YELLOW (Raw Sale):** Grade ![][image2]  
* **RED (Bulk/Budget):** Grade ![][image3]

## **3\. UI/UX Requirements**

* **Input:** Implement 1-10 step selectors or sliders for fast data entry.  
* **Visuals:** Change the card's background or border color to match the vault\_status (Green/Yellow/Red) immediately upon the 4th sub-grade entry.  
* **Voice-to-Text:** Add a button to parse strings (e.g., "Centering 10, Corners 9...") into fields using Regex.

## **4\. Export Module**

Implement an export function to map cards to the eBay "File Exchange" CSV header format, automatically generating the Description and PicURL fields.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAXCAYAAACf+8ZRAAACkElEQVR4Xu2Vz4uNYRTH35ur5GfRnZv7672/cpPy65YNxUIUlkpRkiwsRrKyVTJKWVhYqMmCQikyomQkMQ1Js5hYTESys5w/YHy+7vtOZ87M3HtfRqL7rW/P+5znnPOc5zzPOW8Q9NBDD0mQqtfrmUqlsqlQKKz2i/Mgnc/n1zCmrLDZbC628yCTySxHsTBDuAAIw/CVWC6Xr2gk8LrX8eCAWXRfl0qlCcZLIvZDjF+8bgrhQ3gfo23MF3mFpMDPHm0YZ4iNlxDIi1qtVvS6FnHQcComdl8ZT3jdGVDWURpnozMJrnUabLIb+8lisZizcmQf4bPo+ueEgsb+CXtv9msdoWAVtILHyYBfbwds+pUhBeDk4/AT3GLlFr8VdAxdK5schoM4bASuQOZCh6Cn8LnXyi3ioNHbynhRlP6sQuwG0Rt9jIMH7TIltHkeyrLe6FErt4je9Es4in0N3e18j8BHXrcjMN6A4S0VE4Hv8usWanPoDvvDKeCI/VZu0Wg0VrB+m30OxDK+dyD7pi5ndWchm80uQ/EIfAcHgy6ehQd2z+F7Nn2jQOBb+J1D7/S67RAd5B5+Tvu1aagIURrD+Tn/LpNC2alWq6v0Hba6xyhc6/UipAnsbNgq/oOxUD6Q3VW/t8o/QYCshZeVGWXaryeB+rEyZGX4noQXgnluzfXo67EcX33MRwj6pNXXz+UmfAr3/VKlGuRyuaUc/A6+zhtxmvkHAtsYC1RkBDIEjzFNGbsbqqFYj5taF7Y6z/pY9kfABvsJ5lrY+hXrPU4ELsPqIqx9hldNkSmBx+FYZDtc6uaPuFBQf4WH1G2SPjc9Cb1r2dKNVvr1fxO6GhVfAp7yPv4GUqrcbtmxyffwn+AHiYa15IfmEQcAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEkAAAAXCAYAAABH92JbAAADUUlEQVR4Xu1XS2sTURSekgqCL0RjIK+ZpMH4BCUbUUEphQrVhaAuFboSdCEFceVCxE3RhUgRRRdufJD6QBQElSJSUGwprWBRKkIRXBSk4A+I35c5IyenSRPBDEXmg4+ZOefcued+994zdxwnQoQIEZYo4vH4Std1N5PW1wjFYnFVIpFYYe2e5y23thAQS6fTqUwmsy2fz6+xzlaRzWa3Iv8z1u5AmPPgOJxXEXQd90O4rrVxFog7Dc6zHa6D0nYMzNnYNqMDfX5C/y8kl4lcLpewQc1QKBRWo+1D8J31dcJ4Wc8+7h/AdperSwdaiEgVTST6xMa1GRSoHzzFexqSyeR65HGfgzaxi6EDbc7JOGpFgiC9cO41th0I/Ax7j7ZbUCTOnLWHCfR/kgPj1td22uC70+rWR/wjEXumnki7wClwvyMzAXGOgm9SqVS6JthgiYjE7VWxqx62OfADalRS2+uhVCoto9iyOBaKJAW7Av4Cb1EYvhzsqwmsg0AkXAfAQV6bCfuv0USkGQ5c2+sBC+Ig2zcUiYDxuQhVZSsvJigSOviCa3dXV1fG9T8A3x1ZkWGAK4A519tu4Bz8+7TdQvIe5n0zkbrBSfCnvHwEn9GNNs4CcX0skMEzly1st9HZAR3XTqCvTeCU2VYs5hwHJ7xX2Wsg+V5heeFzQ5HgOIGgkjLFEDQtnQzhuVP5moLCuU1qAfyj6PN9K0Ts8GLvElCUCXBS2lwDv4IfG002fDmwDH82sNUViZ9IOJ46Rgi+GIHj4GvUmHXaFwDJbKFfrySCM8eO2KG2hwEeIoPa5PqTXLa1KoDrl4pZMyHcTazN8+BLjtHhgatGNQXPL4gNRWInksgPbff8GjGKvb5B29sJDsYzn3rJrV/bNCgex6+J9xyTdmPMn9sx+LKVbQeOf8C86cp2468HYi7g+V6w9PHCHtdXnoe4P8DzRfCSE1Lx5mA4KcjneGCTk/OI3qacPO4a/LpsD2wWsgso0oKFw5PmLByvwLPCt+DOIEBW3GNw2vPPU1UwCdiegYOw35DlG/qJWwSo/hrJOMZsEGxD4Dctpoarvu7C2pLBlYTGe8AjcB6uLrMWwdignRTJmI0JA8jhkOSx+2/yjxAhQoQI/xl+A+eKDxLYUUJpAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAXCAYAAACf+8ZRAAAChUlEQVR4Xu2V34dVURTH73VvpN/K7XJ/nfurrgxJV4l6mKeZpJcSUSTpIRoyRET0VERS6SXpoR4aImZUiqHIKJJ5mIfI0EjMQ4/9AfX5zuwz9qx75557VHo5X772OWt9197r7L32OqlUggQJ4iBTq9Xy5XJ5j0brXAHZYrG4hTHtG9vt9ir//Z8hCIK38Cm8UalUXpH4UMokY6GPQ/8B/RfFidVqdYJxzmr/Olh8J9zrmdIsPEsCBz1bB8Kk4a+QfMA3xrNWGwkCBwh8DN+w8KD1+8jlcuu0w/ZIibvNPGOFQmGNb/ehpNG8RrvL+uJAdTnEJONu5zJW0AVZkr6vJFut1vrQiO05HPGFFn+UdD6fX8sCJ+EneMf6o6AycMf7GR7lfZNOqtlsbrBaH2HSaHczXheJHban1oFSqbSZoGnEV2PcegvV8LxLfIHMt9qKLFxNv4Pv6ToNkt7P8xR8YbULICBAdAvBjHba+uOCee7CH17So1E7pnJC+4Q8Doc2ng9g+667siSs1+sb9WXuZvdTsz1BCeSYb9JPkNMrYvsJ59S3fX0U3Ic8I/kLyxxMug3Hg2Cxhk8sc8YE8UeUXBf7Ze04i5+yPocsvktoZhiPhcawG+li++IluItwTUep2rb+fsACI/CjtasjYJ9dKWnTox+G9kajsZX3KeLP+foOIDoPp+FN1br194LrHPNd7Pu0i2F56JJhm4CneU2rf2MbQ/OIcSCMo3y3Kw7uCG39IMPE4wS9VM/WuxVYuBPTn+yedihYvJRX/A6iHcf2VRrvkqnrnHEbpt/4pJsn/h9RUN2rrpjgovV1AztUQXuImONw2Pp7QSWhuiZuMKq3J0iQ4D/gN1AtolBpxev8AAAAAElFTkSuQmCC>